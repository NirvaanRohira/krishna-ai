// Human-readable citations for retrieved passages, shared by the chat UI.
// The corpus stores the Bhagavatam chapter as skandha*1000 + chapter (e.g. 11002).

export type Source = {
  id?: number
  text_source: string
  book_chapter: number | string
  verse: number | string
  text?: string
}

const TITLES: Record<string, string> = {
  bhagavad_gita: 'Bhagavad Gita',
  bhagavatam: 'Srimad Bhagavatam',
  srimad_bhagavatam: 'Srimad Bhagavatam',
  yoga_sutras: 'Yoga Sutras',
}

function titleCase(slug: string): string {
  return slug.split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

export function formatSourceRef(s: Source): string {
  const title = TITLES[s.text_source] ?? titleCase(s.text_source)
  const ch = Number(s.book_chapter)
  if ((s.text_source === 'bhagavatam' || s.text_source === 'srimad_bhagavatam') && ch >= 1000) {
    return `${title} ${Math.floor(ch / 1000)}.${ch % 1000}.${s.verse}`
  }
  return `${title} ${s.book_chapter}.${s.verse}`
}

/** Short form for compact lists: "Gita 2.47". */
export function shortSourceRef(s: Source): string {
  return formatSourceRef(s).replace('Bhagavad Gita', 'Gita').replace('Srimad Bhagavatam', 'Bhagavatam')
}

/** Drop duplicates and malformed rows coming off the wire. */
export function cleanSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Source[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const s = r as Source
    if (typeof s.text_source !== 'string' || s.book_chapter == null || s.verse == null) continue
    const key = formatSourceRef(s)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ text_source: s.text_source, book_chapter: s.book_chapter, verse: s.verse, text: typeof s.text === 'string' ? s.text : undefined })
  }
  return out
}
