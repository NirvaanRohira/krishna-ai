/**
 * Ingest Yoga Sutras of Patanjali from GRETIL (CC BY-NC-SA 4.0).
 * Source: Kāśinātha Śāstrī Āgāśe edition (1904), input by Philipp A. Maas.
 * 196 sutras across 4 Padas.
 *
 * Run: npx tsx scripts/ingest-yoga-sutras.ts
 */

import { CANONICAL_VERSE_COUNT } from './lib/canonical-counts'
import { parseGretilInline } from './lib/vedic-text-parser'
import { makeClients, ingestSource } from './lib/ingest-helpers'

const URL = 'http://gretil.sub.uni-goettingen.de/gretil/corpustei/transformations/plaintext/sa_pataJjali-yogasUtra.txt'

async function main() {
  const { embeddingModel, supabase } = makeClients()

  console.log('── yoga_sutras ──')
  console.log(`  Fetching ${URL}`)

  const res = await fetch(URL)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Yoga Sutras`)
  const rawText = await res.text()

  const verses = parseGretilInline(rawText, 'ys')
  const expected = CANONICAL_VERSE_COUNT.yoga_sutras
  console.log(`  Parsed ${verses.length} sutras (expected ${expected})`)

  if (verses.length !== expected) {
    throw new Error(`Count mismatch: expected ${expected}, got ${verses.length}`)
  }

  await ingestSource('yoga_sutras', verses, expected, embeddingModel, supabase)
  console.log('\nYoga Sutras ingestion complete.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
