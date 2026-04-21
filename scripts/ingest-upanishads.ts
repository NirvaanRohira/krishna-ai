/**
 * Ingest available Upanishads from GRETIL (CC BY-NC-SA 4.0).
 * Sanskrit texts are public domain (thousands of years old).
 * Electronic editions contributed to GRETIL with no copyright claims.
 *
 * Run: npx tsx scripts/ingest-upanishads.ts
 * Or:  bun scripts/ingest-upanishads.ts
 *
 * Upanishads NOT yet found on GRETIL plaintext server (add when URLs confirmed):
 *   - Kena (34 mantras)
 *   - Mundaka (64 mantras)
 *   - Taittiriya (49 sections)
 */

import { CANONICAL_VERSE_COUNT } from './lib/canonical-counts'
import { parseGretilInline, parseGretilBlock, parseAitareya } from './lib/vedic-text-parser'
import { makeClients, ingestSource } from './lib/ingest-helpers'

const GRETIL_BASE = 'http://gretil.sub.uni-goettingen.de/gretil/corpustei/transformations/plaintext'

const UPANISHADS = [
  {
    key: 'isha_upanishad',
    url: `${GRETIL_BASE}/sa_IzopaniSad-or-IzAvAsyopaniSadkANva-recension-comm.txt`,
    parse: (text: string) => parseGretilInline(text, 'isup'),
  },
  {
    key: 'katha_upanishad',
    url: `${GRETIL_BASE}/sa_kathopaniSad.txt`,
    parse: (text: string) => parseGretilBlock(text, 'kau'),
  },
  {
    key: 'mandukya_upanishad',
    url: `${GRETIL_BASE}/sa_mANDUkyopaniSad-comm.txt`,
    parse: (text: string) => parseGretilInline(text, 'mandup'),
  },
  {
    key: 'prashna_upanishad',
    url: `${GRETIL_BASE}/sa_praznopaniSad-comm.txt`,
    parse: (text: string) => parseGretilInline(text, 'prup'),
  },
  {
    key: 'aitareya_upanishad',
    url: `${GRETIL_BASE}/sa_aitareyopaniSad-comm.txt`,
    parse: parseAitareya,
  },
]

async function main() {
  const { embeddingModel, supabase } = makeClients()

  for (const { key, url, parse } of UPANISHADS) {
    const canonicalCount = CANONICAL_VERSE_COUNT[key]
    if (!canonicalCount) {
      console.warn(`[${key}] No canonical count — skipping`)
      continue
    }

    console.log(`\n── ${key} ──`)
    console.log(`  Fetching ${url}`)

    let rawText: string
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      rawText = await res.text()
    } catch (err) {
      console.error(`  Failed to fetch: ${err}`)
      continue
    }

    const verses = parse(rawText)
    console.log(`  Parsed ${verses.length} verses (expected ${canonicalCount})`)

    if (verses.length !== canonicalCount) {
      console.error(`  COUNT MISMATCH — expected ${canonicalCount}, got ${verses.length}. Skipping ${key}.`)
      continue
    }

    await ingestSource(key, verses, canonicalCount, embeddingModel, supabase)
  }

  console.log('\nAll Upanishad ingestion complete.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
