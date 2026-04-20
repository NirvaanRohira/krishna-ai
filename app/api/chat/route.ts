import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denseRetrieve, type DenseResult } from '@/lib/retrieval/dense'
import { generateText } from '@/lib/gemini'
import { SYSTEM_PROMPT_V0 } from '@/lib/prompts/system_v0'

type Message = { role: 'user' | 'assistant'; content: string }

function buildPrompt(sources: DenseResult[], history: Message[], message: string): string {
  const contextBlock = sources
    .map((s, i) => `[${i + 1}] Bhagavad Gita ${s.book_chapter}.${s.verse}: ${s.text}`)
    .join('\n')

  const historyBlock = history
    .map((m) => `${m.role === 'user' ? 'Seeker' : 'Yogi'}: ${m.content}`)
    .join('\n')

  return [
    SYSTEM_PROMPT_V0,
    '',
    '--- Retrieved context ---',
    contextBlock,
    '--- End context ---',
    '',
    historyBlock,
    `Seeker: ${message}`,
    'Yogi:',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { message, history = [] } = body

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const sources = await denseRetrieve(message, { supabaseClient: supabase })
    const prompt = buildPrompt(sources, history, message)
    const response = await generateText(prompt)
    return NextResponse.json({ response, sources })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
