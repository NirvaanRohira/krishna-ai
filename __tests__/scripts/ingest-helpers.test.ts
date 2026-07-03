import { describe, test, expect, vi } from 'vitest'
import { ingestSource } from '../../scripts/lib/ingest-helpers'
import type { ParsedVerse } from '../../scripts/lib/gretil-parser'

function makeVerses(count: number): ParsedVerse[] {
  return Array.from({ length: count }, (_, i) => ({
    chapter: 1,
    verse: i + 1,
    text: `verse text ${i + 1}`,
  }))
}

// A supabase stub that fails loudly if any query is attempted — proves the
// canonical-count guard runs BEFORE any DB access / embedding.
function makeExplodingSupabase() {
  return {
    from() {
      throw new Error('DB should not be touched when count validation fails')
    },
  }
}

const fakeEmbeddingModel = {
  batchEmbedContents: vi.fn(async () => {
    throw new Error('embedding should not be called when count validation fails')
  }),
} as any

describe('ingestSource canonical-count validation', () => {
  test('throws when parsed verse count does not match canonicalCount', async () => {
    const verses = makeVerses(22) // aitareya_upanishad canonical is 23 → short by 1
    await expect(
      ingestSource('aitareya_upanishad', verses, 23, fakeEmbeddingModel, makeExplodingSupabase())
    ).rejects.toThrow(/expected 23.*got 22/i)
  })

  test('does not embed or touch the DB when count validation fails', async () => {
    const verses = makeVerses(22)
    await ingestSource(
      'aitareya_upanishad',
      verses,
      23,
      fakeEmbeddingModel,
      makeExplodingSupabase()
    ).catch(() => {})
    expect(fakeEmbeddingModel.batchEmbedContents).not.toHaveBeenCalled()
  })

  test('error message reports the missing count so a dropped-verse parse fails fast', async () => {
    const verses = makeVerses(50)
    await expect(
      ingestSource('bhagavatam', verses, 14092, fakeEmbeddingModel, makeExplodingSupabase())
    ).rejects.toThrow(/14042/) // 14092 - 50 missing
  })
})
