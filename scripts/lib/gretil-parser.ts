export interface ParsedVerse {
  chapter: number
  verse: number
  text: string
}

export function parseGitaHtml(html: string): ParsedVerse[] {
  // Matches: <text>  Bhg_CC.VVVa|c <rest>
  const LINE_RE = /^(.+?)\s{2,}Bhg_(\d{2})\.(\d{3})([ac])\s/

  const padas = new Map<string, { chapter: number; verse: number; a?: string; c?: string }>()

  for (const rawLine of html.split('\n')) {
    const m = LINE_RE.exec(rawLine)
    if (!m) continue

    const [, text, chStr, vStr, pada] = m
    const chapter = parseInt(chStr, 10)
    const verse = parseInt(vStr, 10)
    const key = `${chStr}.${vStr}`

    if (!padas.has(key)) padas.set(key, { chapter, verse })
    const entry = padas.get(key)!
    if (pada === 'a') entry.a = text
    if (pada === 'c') entry.c = text
  }

  return Array.from(padas.values())
    .filter((e) => e.a !== undefined || e.c !== undefined)
    .sort((a, b) => a.chapter - b.chapter || a.verse - b.verse)
    .map((e) => ({
      chapter: e.chapter,
      verse: e.verse,
      text: [e.a, e.c].filter(Boolean).join('\n'),
    }))
}
