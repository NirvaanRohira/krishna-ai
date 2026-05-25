import { SYSTEM_PROMPT_V1 } from '@/lib/prompts/system_v1'

function formatRef(source: string, bookChapter: string | number, verse: string | number): string {
  const src = String(source)
  const ch = Number(bookChapter)
  if (src === 'srimad_bhagavatam' && ch >= 1000) {
    const skandha = Math.floor(ch / 1000)
    const chapter = ch % 1000
    return `srimad_bhagavatam Skandha ${skandha} Chapter ${chapter} verse ${verse}`
  }
  if (src === 'bhagavad_gita') return `bhagavad_gita chapter ${bookChapter} verse ${verse}`
  if (src === 'yoga_sutras') return `yoga_sutras ${bookChapter}.${verse}`
  return `${src} ${bookChapter}.${verse}`
}
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
    .map((s, i) => `[${i + 1}] ${formatRef(s.text_source, s.book_chapter, s.verse)}: ${s.text}`)
    .join('\n')

  const historyBlock = history
    .map((m) => `${m.role === 'user' ? 'Seeker' : 'Yogi'}: ${m.content}`)
    .join('\n')

  return [
    systemPrompt ?? SYSTEM_PROMPT_V1,
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
