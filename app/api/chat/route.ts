import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { classifyComplexity } from '@/lib/retrieval/complexityRouter'
import { classifyMessage } from '@/lib/guardrails/classifier'
import { getGuardrailResponse } from '@/lib/guardrails/responses'
import { parallelRetrieve } from '@/lib/retrieval/parallelRetrieval'
import { runCRAG } from '@/lib/crag/loop'
import { buildPrompt } from '@/lib/prompts/chat'
import { generateText, generateTextStream } from '@/lib/llm'
import { startSession, saveExchange, endSession } from '@/lib/session'
import { loadAndInjectProfile } from '@/lib/memory/profileInjector'
import { queryStructuralLookup } from '@/lib/retrieval/structuralLookup'
import { getContextVector } from '@/lib/retrieval/contextRetrieval'

type Message = { role: 'user' | 'assistant'; content: string }

const encoder = new TextEncoder()

function sseChunk(data: object | '[DONE]'): Uint8Array {
  const line = data === '[DONE]' ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(data)}\n\n`
  return encoder.encode(line)
}

const STOP_WORDS = new Set(['the','a','an','is','it','in','on','of','to','and','or','but','for','with','my','i','am','me','do','be','have','that','this','are','was','at','by','as','so','if','not','can','you','we','he','she','they','what','why','how','who','when','where','will','would','could','should','did','has','had','its'])

function extractKeywords(message: string): string[] {
  return message
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
}

// For short follow-up messages, enrich the retrieval query with recent history
// so "yeah that didn't work" retrieves the same topic as the previous turn.
function buildRetrievalQuery(message: string, history: Message[]): string {
  if (message.length > 60 || history.length === 0) return message
  const lastUser = history.filter(m => m.role === 'user').slice(-1)[0]?.content ?? ''
  const lastAssistant = history.filter(m => m.role === 'assistant').slice(-1)[0]?.content?.slice(0, 300) ?? ''
  return [lastUser, message, lastAssistant].filter(Boolean).join(' ')
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { message, history = [], sessionId: existingSessionId } = body

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionId: string = existingSessionId ?? await startSession(supabase, user.id)

  const stream = new TransformStream<Uint8Array, Uint8Array>()
  const writer = stream.writable.getWriter()

  ;(async () => {
    try {
      // ── Guardrail check (pre-LLM) ──────────────────────────────
      const category = await classifyMessage(message)
      const fixedResponse = getGuardrailResponse(category)

      if (fixedResponse !== undefined) {
        await writer.write(sseChunk({ t: 's', id: sessionId, src: [] }))
        const tokens = fixedResponse.match(/\S+\s*/g) ?? [fixedResponse]
        for (const token of tokens) {
          await writer.write(sseChunk({ t: 'c', v: token }))
        }
        await saveExchange(supabase, sessionId, message, fixedResponse, [], false)
        if (category === 'CRISIS') {
          await endSession(supabase, sessionId)
        }
        await writer.write(sseChunk('[DONE]'))
        return
      }

      // ── Parallel: turn count + complexity + profile (all independent of each other) ──
      const recentHistory = (history as Message[]).slice(-40)
      const retrievalQuery = buildRetrievalQuery(message, recentHistory)
      const keywords = extractKeywords(message)

      const [{ data: sessionRow }, complexity, systemPrompt, anchors, contextVector] = await Promise.all([
        supabase.from('sessions').select('turn_count').eq('id', sessionId).single(),
        classifyComplexity(message),
        loadAndInjectProfile(user.id, supabase),
        queryStructuralLookup(keywords, { supabaseClient: supabase }),
        getContextVector(user.id, { supabaseClient: supabase }),
      ])

      const turnCount: number = (sessionRow as { turn_count?: number } | null)?.turn_count ?? 0
      if (turnCount >= 15) {
        console.log('[persona-drift-check] turn', turnCount, '— injecting drift reminder')
      }
      void contextVector // reserved for L4 future use: pass to dense retrieval as secondary vector

      if (complexity === 'SIMPLE') {
        const sources = await parallelRetrieve(retrievalQuery, { supabaseClient: supabase })
        await writer.write(sseChunk({ t: 's', id: sessionId, src: sources }))

        const prompt = buildPrompt(sources, recentHistory, message, systemPrompt, anchors)
        let fullResponse = ''
        for await (const chunk of generateTextStream(prompt)) {
          fullResponse += chunk
          await writer.write(sseChunk({ t: 'c', v: chunk }))
        }

        await saveExchange(supabase, sessionId, message, fullResponse, sources)

      } else {
        let chunksEmitted = false
        const { response, sources } = await runCRAG(
          retrievalQuery,
          recentHistory,
          {
            supabaseClient: supabase,
            systemPrompt,
            anchors,
            onChunk: async (chunk) => {
              chunksEmitted = true
              await writer.write(sseChunk({ t: 'c', v: chunk }))
            },
          }
        )
        await writer.write(sseChunk({ t: 's', id: sessionId, src: sources }))

        // give-up path: onChunk never called, emit response as tokens
        if (!chunksEmitted) {
          const tokens = response.match(/\S+\s*/g) ?? [response]
          for (const token of tokens) {
            await writer.write(sseChunk({ t: 'c', v: token }))
          }
        }

        await saveExchange(supabase, sessionId, message, response, sources)
      }

      await writer.write(sseChunk('[DONE]'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      await writer.write(sseChunk({ t: 'e', msg }))
    } finally {
      await writer.close()
    }
  })()

  return new Response(stream.readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
