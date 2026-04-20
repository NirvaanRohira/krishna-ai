import { describe, test, expect, vi } from 'vitest'
import { validateAndIngest, type IngestOptions, type VerseRow } from '../../scripts/lib/ingest-pipeline'
import type { ParsedVerse } from '../../scripts/lib/gretil-parser'

function makeVerses(count: number): ParsedVerse[] {
  return Array.from({ length: count }, (_, i) => ({
    chapter: 1,
    verse: i + 1,
    text: `verse text ${i + 1}`,
  }))
}

function makeOpts(overrides: Partial<IngestOptions> = {}): IngestOptions {
  return {
    textSource: 'bhagavad_gita',
    canonicalCount: 3,
    tag: vi.fn().mockResolvedValue(['duty', 'dharma']),
    embed: vi.fn().mockResolvedValue(new Array(3072).fill(0.1)),
    upsert: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('validateAndIngest', () => {
  test('throws when parsed verse count does not match canonicalCount', async () => {
    const verses = makeVerses(2) // short by 1
    const opts = makeOpts({ canonicalCount: 3 })
    await expect(validateAndIngest(verses, opts)).rejects.toThrow(/expected 3.*got 2/i)
  })

  test('does not call upsert when count validation fails', async () => {
    const verses = makeVerses(2)
    const opts = makeOpts({ canonicalCount: 3 })
    await validateAndIngest(verses, opts).catch(() => {})
    expect(opts.upsert).not.toHaveBeenCalled()
  })

  test('error message includes the missing count so operator can debug', async () => {
    const verses = makeVerses(5)
    const opts = makeOpts({ canonicalCount: 700 })
    await expect(validateAndIngest(verses, opts)).rejects.toThrow(/695/)
  })

  test('calls upsert with correctly shaped VerseRows on success', async () => {
    const verses = makeVerses(3)
    const opts = makeOpts({ canonicalCount: 3 })
    await validateAndIngest(verses, opts)
    expect(opts.upsert).toHaveBeenCalledTimes(1)
    const rows: VerseRow[] = (opts.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      text_source: 'bhagavad_gita',
      book_chapter: 1,
      verse: 1,
      text: 'verse text 1',
    })
    expect(rows[0].embedding).toHaveLength(3072)
    expect(rows[0].theme_tags).toEqual(['duty', 'dharma'])
  })

  test('calls embed once per verse', async () => {
    const verses = makeVerses(3)
    const opts = makeOpts({ canonicalCount: 3 })
    await validateAndIngest(verses, opts)
    expect(opts.embed).toHaveBeenCalledTimes(3)
  })

  test('calls tag once per verse', async () => {
    const verses = makeVerses(3)
    const opts = makeOpts({ canonicalCount: 3 })
    await validateAndIngest(verses, opts)
    expect(opts.tag).toHaveBeenCalledTimes(3)
  })
})
