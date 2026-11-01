import { SYSTEM_PROMPT_V2 } from '@/lib/prompts/system_v2'

function formatRef(source: string, bookChapter: string | number, verse: string | number): string {
  const src = String(source)
  const ch = Number(bookChapter)
  // The corpus stores the Bhagavatam under text_source 'bhagavatam' with the chapter
  // skandha-encoded as skandha*1000 + chapter (e.g. 11002). Decode it and render the
  // human label the system prompts describe ('srimad_bhagavatam Skandha X Chapter Y ...').
  if (src === 'bhagavatam' && ch >= 1000) {
    const skandha = Math.floor(ch / 1000)
    const chapter = ch % 1000
    return `srimad_bhagavatam Skandha ${skandha} Chapter ${chapter} verse ${verse}`
  }
  if (src === 'bhagavad_gita') return `bhagavad_gita chapter ${bookChapter} verse ${verse}`
  if (src === 'yoga_sutras') return `yoga_sutras ${bookChapter}.${verse}`
  return `${src} ${bookChapter}.${verse}`
}
import type { RRFResult } from '@/lib/retrieval/rrfMerge'
import { detectLanguage, type Lang } from '@/lib/language'
import type { LookupResult } from '@/lib/retrieval/structuralLookup'

type Message = { role: 'user' | 'assistant'; content: string }

const LANGUAGE_NAMES: Partial<Record<Lang, string>> = {
  hi: 'Hindi, in Devanagari script', bn: 'Bengali, in Bengali script', ta: 'Tamil, in Tamil script', te: 'Telugu, in Telugu script',
  kn: 'Kannada, in Kannada script', ml: 'Malayalam, in Malayalam script', gu: 'Gujarati, in Gujarati script',
  pa: 'Punjabi, in Gurmukhi script', or: 'Odia, in Odia script', hinglish: 'Hinglish (Hindi written in Latin letters, the way the seeker writes)',
}

/**
 * The reply language, stated right before the answer is written: models drift to English
 * when the long system prompt and the context are English, so a rule buried at the top of
 * the prompt isn't enough. Everything the seeker reads (including the page's sections and
 * title) follows it; the page's ref attribute stays as the context label.
 */
export function replyLanguageLine(message: string): string {
  const name = LANGUAGE_NAMES[detectLanguage(message)]
  return name ? `[Write your entire reply in ${name}: the reflection, the question, and every part of a page except its ref.]` : ''
}

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
    systemPrompt ?? SYSTEM_PROMPT_V2,
    '',
    '--- Retrieved context ---',
    anchorBlock,
    contextBlock,
    '--- End context ---',
    '',
    historyBlock,
    `Seeker: ${message}`,
    replyLanguageLine(message),
    'Yogi:',
  ]
    .filter(Boolean)
    .join('\n')
}
