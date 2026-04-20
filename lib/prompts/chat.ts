import { SYSTEM_PROMPT_V0 } from '@/lib/prompts/system_v0'
import type { RRFResult } from '@/lib/retrieval/rrfMerge'

type Message = { role: 'user' | 'assistant'; content: string }

export function buildPrompt(sources: RRFResult[], history: Message[], message: string): string {
  const contextBlock = sources
    .map((s, i) => `[${i + 1}] ${s.text_source} ${s.book_chapter}.${s.verse}: ${s.text}`)
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
