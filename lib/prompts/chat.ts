import { SYSTEM_PROMPT_V0 } from '@/lib/prompts/system_v0'
import type { RRFResult } from '@/lib/retrieval/rrfMerge'
import type { LookupResult } from '@/lib/retrieval/structuralLookup'

type Message = { role: 'user' | 'assistant'; content: string }

export function buildPrompt(
  sources: RRFResult[],
  history: Message[],
  message: string,
  systemPrompt?: string,
  anchors?: LookupResult[]
): string {
  const anchorBlock = anchors && anchors.length > 0
    ? anchors.map(a => `[Anchor] ${a.label} (${a.text_source} ${a.book_chapter}:${a.verse_start}-${a.verse_end})`).join('\n')
    : ''

  const contextBlock = sources
    .map((s, i) => `[${i + 1}] ${s.text_source} ${s.book_chapter}.${s.verse}: ${s.text}`)
    .join('\n')

  const historyBlock = history
    .map((m) => `${m.role === 'user' ? 'Seeker' : 'Yogi'}: ${m.content}`)
    .join('\n')

  return [
    systemPrompt ?? SYSTEM_PROMPT_V0,
    '',
    '--- Retrieved context ---',
    anchorBlock,
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
