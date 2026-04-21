/**
 * Ingest Srimad Bhagavatam (all 12 Skandhas) from GRETIL (CC BY-NC-SA 4.0).
 * Source: Input by Ulrich Stiehl; ~18,000 shlokas.
 *
 * book_chapter encoding: skandha * 1000 + chapter_within_skandha
 * e.g. Skandha 10, Chapter 29 → book_chapter = 10029
 *
 * First run counts verses and logs total — add to canonical-counts.ts after verification.
 *
 * Run: npx tsx scripts/ingest-bhagavatam.ts
 */

import { parseBhagavatam } from './lib/vedic-text-parser'
import { makeClients, ingestSource } from './lib/ingest-helpers'

const URL = 'http://gretil.sub.uni-goettingen.de/gretil/corpustei/transformations/plaintext/sa_bhAgavatapurANa.txt'

async function main() {
  const { embeddingModel, supabase } = makeClients()

  console.log('── bhagavatam ──')
  console.log(`  Fetching ${URL} (large file, may take a moment)...`)

  const res = await fetch(URL)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Bhagavatam`)
  const rawText = await res.text()

  const verses = parseBhagavatam(rawText)
  console.log(`  Parsed ${verses.length} total shlokas`)

  // Log per-skandha breakdown for verification
  const bySkandha: Record<number, number> = {}
  for (const v of verses) {
    const sk = Math.floor(v.chapter / 1000)
    bySkandha[sk] = (bySkandha[sk] ?? 0) + 1
  }
  for (let i = 1; i <= 12; i++) {
    console.log(`  Skandha ${i}: ${bySkandha[i] ?? 0} shlokas`)
  }

  if (verses.length === 0) {
    throw new Error('No verses parsed — check parser or URL')
  }

  await ingestSource('bhagavatam', verses, verses.length, embeddingModel, supabase)
  console.log(`\nBhagavatam ingestion complete. Total: ${verses.length} shlokas.`)
  console.log(`Add CANONICAL_VERSE_COUNT.bhagavatam = ${verses.length} to canonical-counts.ts`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
