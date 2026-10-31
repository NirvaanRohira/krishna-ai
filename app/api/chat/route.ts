export const maxDuration = 60

import { NextResponse, after } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit, rateLimitKey } from '@/lib/rateLimit'
import { classifyComplexity } from '@/lib/retrieval/complexityRouter'
import { classifyMessage } from '@/lib/guardrails/classifier'
import { getGuardrailResponse } from '@/lib/guardrails/responses'
import { parallelRetrieve } from '@/lib/retrieval/parallelRetrieval'
import { runCRAG } from '@/lib/crag/loop'
import { buildPrompt } from '@/lib/prompts/chat'
import { generateTextStream } from '@/lib/llm'
import { startSession, saveExchange, endSession, resumeSession } from '@/lib/session'
import { loadAndInjectProfile } from '@/lib/memory/profileInjector'
import { queryStructuralLookup } from '@/lib/retrieval/structuralLookup'
import { withVoiceMode } from '@/lib/prompts/voice'
import { closeStaleSessions } from '@/lib/memory/postSession'
import { log } from '@/lib/log'
import { publicSources } from '@/lib/sources-server'
import { consumeQuota, quotaMessage, recordLlmUsage, estimateTokens } from '@/lib/quota'

type Message = { role: 'user' | 'assistant'; content: string }

// How much raw conversation goes into every prompt. History is re-sent (and re-billed)
// on every turn, so 40 messages meant a long session's input tokens grew without bound.
// Long-term context is already carried by the memory profile; 12 messages = the last
// 6 exchanges, which is plenty for conversational continuity.
const HISTORY_MESSAGES = Number(process.env.CHAT_HISTORY_MESSAGES) || 12

// Hard cap on a single message. Prevents one request from burning thousands of input
// tokens (cost DoS) and bounds what we store. ~2,000 chars ≈ a long, heartfelt paragraph.
const MAX_MESSAGE_CHARS = 2000

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

const GREETING_RE = /^(hi|hey|hello|how are you|good morning|namaste|hare krishna)/i

function isGreetingMessage(message: string): boolean {
  const words = message.trim().split(/\s+/)
  return words.length <= 4 && GREETING_RE.test(message.trim())
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  // `history` from the client is deliberately ignored — see resumeSession().
  const { message, sessionId: existingSessionId, mode } = body
  // 'voice' = reply will be spoken by the avatar → shorter, conversational answers.
  const voice = mode === 'voice'

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: `Message is too long (max ${MAX_MESSAGE_CHARS} characters)` }, { status: 413 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { allowed, retryAfterSec } = checkRateLimit(rateLimitKey(req, user.id), { limit: 30, windowMs: 60_000 })
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } })
  }

  // Plan quota + durable per-minute limit (Postgres), checked alongside loading the session.
  const [resumed, quota] = await Promise.all([
    resumeSession(supabase, existingSessionId, HISTORY_MESSAGES),
    consumeQuota(supabase, 'message'),
  ])
  if (!quota.allowed) {
    return NextResponse.json(
      { error: quotaMessage(quota, 'message'), code: quota.reason, plan: quota.plan },
      { status: 429, headers: quota.reason === 'rate' ? { 'Retry-After': '60' } : {} }
    )
  }
  const sessionId: string = resumed?.id ?? await startSession(supabase, user.id)
  if (!resumed) {
    // New conversation: once the response has been sent, fold any earlier conversations
    // whose end-beacon never arrived into the user's profile (see closeStaleSessions).
    after(() => closeStaleSessions(supabase, user.id, sessionId))
  }
  const recentHistory: Message[] = resumed?.history ?? []
  const turnCount = resumed?.turnCount ?? 0

  const stream = new TransformStream<Uint8Array, Uint8Array>()
  const writer = stream.writable.getWriter()

  // Spend metering: estimated tokens for this turn, recorded once the reply is done.
  let usagePromptChars = 0
  let usageResponse = ''

  ;(async () => {
    try {
      const t0 = Date.now()

      // ── Greeting fast path: skip all LLM pre-processing ──────────
      if (isGreetingMessage(message)) {
        const systemPrompt = withVoiceMode(await loadAndInjectProfile(user.id, supabase), voice)
        const prompt = buildPrompt([], recentHistory, message, systemPrompt, [])
        usagePromptChars = prompt.length
        await writer.write(sseChunk({ t: 's', id: sessionId, src: [] }))
        let fullResponse = ''
        for await (const chunk of generateTextStream(prompt)) {
          fullResponse += chunk
          await writer.write(sseChunk({ t: 'c', v: chunk }))
        }
        usageResponse = fullResponse
        console.log(`[timing] greeting response: ${Date.now()-t0}ms`)
        await saveExchange(supabase, sessionId, message, fullResponse, [])
        await writer.write(sseChunk('[DONE]'))
        return
      }

      // ── All independent pre-retrieval work fires at once ──────────
      const retrievalQuery = buildRetrievalQuery(message, recentHistory)
      const keywords = extractKeywords(message)

      const [
        category,
        complexity,
        profilePrompt,
        anchors,
        retrievedSources,
      ] = await Promise.all([
        classifyMessage(message).then(r => { console.log(`[timing] guardrail: ${Date.now()-t0}ms`); return r }),
        classifyComplexity(message).then(r => { console.log(`[timing] complexity: ${Date.now()-t0}ms`); return r }),
        loadAndInjectProfile(user.id, supabase).then(r => { console.log(`[timing] profile: ${Date.now()-t0}ms`); return r }),
        queryStructuralLookup(keywords, { supabaseClient: supabase }).then(r => { console.log(`[timing] lookup: ${Date.now()-t0}ms`); return r }),
        parallelRetrieve(retrievalQuery, { supabaseClient: supabase }).then(r => { console.log(`[timing] retrieve: ${Date.now()-t0}ms`); return r }),
      ])
      console.log(`[timing] fan-out done: ${Date.now()-t0}ms, complexity=${complexity}`)
      const systemPrompt = withVoiceMode(profilePrompt, voice)

      // ── Guardrail gate (checked after parallel fan-out) ────────
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

      if (turnCount >= 15) {
        console.log('[persona-drift-check] turn', turnCount, '— injecting drift reminder')
      }

      if (complexity === 'SIMPLE') {
        const sources = retrievedSources
        await writer.write(sseChunk({ t: 's', id: sessionId, src: publicSources(sources) }))

        const prompt = buildPrompt(sources, recentHistory, message, systemPrompt, anchors)
        usagePromptChars = prompt.length
        let fullResponse = ''
        let firstChunk = true
        for await (const chunk of generateTextStream(prompt)) {
          if (firstChunk) { console.log(`[timing] SIMPLE first token: ${Date.now()-t0}ms`); firstChunk = false }
          fullResponse += chunk
          await writer.write(sseChunk({ t: 'c', v: chunk }))
        }

        usageResponse = fullResponse
        await saveExchange(supabase, sessionId, message, fullResponse, sources)

      } else {
        // Emit session ID before CRAG starts so the client can track the session
        // even when CRAG takes several seconds. Sources are emitted after.
        await writer.write(sseChunk({ t: 's', id: sessionId }))
        let chunksEmitted = false
        const { response, sources } = await runCRAG(
          retrievalQuery,
          recentHistory,
          {
            supabaseClient: supabase,
            systemPrompt,
            anchors,
            prefetchedSources: retrievedSources,
            originalMessage: message,
            onChunk: async (chunk) => {
              if (!chunksEmitted) console.log(`[timing] CRAG first token: ${Date.now()-t0}ms`)
              chunksEmitted = true
              await writer.write(sseChunk({ t: 'c', v: chunk }))
            },
          }
        )

        // give-up path: onChunk never called, emit response as tokens
        if (!chunksEmitted) {
          const tokens = response.match(/\S+\s*/g) ?? [response]
          for (const token of tokens) {
            await writer.write(sseChunk({ t: 'c', v: token }))
          }
        }

        // CRAG picks its sources while it runs, so they're sent once it's done (the client
        // shows "Drawn from" when the reply completes).
        await writer.write(sseChunk({ t: 's', id: sessionId, src: publicSources(sources) }))
        usagePromptChars = buildPrompt(sources, recentHistory, message, systemPrompt, anchors).length
        usageResponse = response
        await saveExchange(supabase, sessionId, message, response, sources)
      }

      await writer.write(sseChunk('[DONE]'))
    } catch (err) {
      // Log the real error server-side; never send provider/DB internals to the browser.
      log.error('chat', 'stream failed', { sessionId, userId: user.id }, err)
      await writer.write(sseChunk({ t: 'e', msg: 'Something went wrong. Please try again.' }))
    } finally {
      // After [DONE] has been sent, so it never delays the reply.
      if (usagePromptChars > 0) {
        await recordLlmUsage(supabase, Math.ceil(usagePromptChars / 3.5), estimateTokens(usageResponse))
      }
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
