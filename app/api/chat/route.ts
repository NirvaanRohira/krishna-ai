import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { classifyComplexity } from '@/lib/retrieval/complexityRouter'
import { parallelRetrieve } from '@/lib/retrieval/parallelRetrieval'
import { runCRAG } from '@/lib/crag/loop'
import { buildPrompt } from '@/lib/prompts/chat'
import { generateText } from '@/lib/gemini'
import { startSession, saveExchange } from '@/lib/session'

type Message = { role: 'user' | 'assistant'; content: string }

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

  try {
    const complexity = await classifyComplexity(message)
    let response: string
    let sources: object[]

    if (complexity === 'SIMPLE') {
      const retrieved = await parallelRetrieve(message, { supabaseClient: supabase })
      const prompt = buildPrompt(retrieved, history as Message[], message)
      response = await generateText(prompt)
      sources = retrieved
    } else {
      const result = await runCRAG(message, history as Message[], { supabaseClient: supabase })
      response = result.response
      sources = result.sources
    }

    await saveExchange(supabase, sessionId, message, response, sources)

    return NextResponse.json({ response, sources, sessionId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
