import type { ParsedVerse } from './gretil-parser'

export interface VerseRow {
  text_source: string
  book_chapter: number
  verse: number
  text: string
  theme_tags: string[]
  embedding: number[]
}

export interface IngestOptions {
  textSource: string
  canonicalCount: number
  batchSize?: number
  batchDelayMs?: number
  tag: (text: string) => Promise<string[]>
  embed: (text: string) => Promise<number[]>
  upsert: (rows: VerseRow[]) => Promise<void>
}

export async function validateAndIngest(
  verses: ParsedVerse[],
  opts: IngestOptions
): Promise<void> {
  const { textSource, canonicalCount, tag, embed, upsert, batchSize = 5, batchDelayMs = 0 } = opts

  if (verses.length !== canonicalCount) {
    const missing = canonicalCount - verses.length
    throw new Error(
      `Verse count mismatch: expected ${canonicalCount}, got ${verses.length} (missing ${missing})`
    )
  }

  for (let i = 0; i < verses.length; i += batchSize) {
    const batch = verses.slice(i, i + batchSize)
    const rows: VerseRow[] = await Promise.all(
      batch.map(async (v) => {
        const [theme_tags, embedding] = await Promise.all([tag(v.text), embed(v.text)])
        return {
          text_source: textSource,
          book_chapter: v.chapter,
          verse: v.verse,
          text: v.text,
          theme_tags,
          embedding,
        }
      })
    )
    await upsert(rows)
    if (batchDelayMs > 0 && i + batchSize < verses.length) {
      await new Promise((r) => setTimeout(r, batchDelayMs))
    }
  }
}
