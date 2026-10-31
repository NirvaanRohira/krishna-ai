import type { RRFResult } from '@/lib/retrieval/rrfMerge'

/**
 * What the browser receives about the passages an answer drew on. References always;
 * the verse TEXT only when SHOW_VERSE_TEXT=true, because the digital editions in the
 * corpus carry "reference only" / "personal study" terms until licensing is settled
 * (docs/CORPUS_LICENSES.md). Server-side, so the text never leaves the server otherwise.
 */
export function publicSources(sources: RRFResult[]) {
  const withText = process.env.SHOW_VERSE_TEXT === 'true'
  return sources.map((s) => ({
    text_source: s.text_source,
    book_chapter: s.book_chapter,
    verse: s.verse,
    ...(withText ? { text: s.text } : {}),
  }))
}
