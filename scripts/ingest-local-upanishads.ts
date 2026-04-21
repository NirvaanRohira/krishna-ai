/**
 * Ingest Kena, Mundaka, and Taittiriya Upanishads from local ITRANS .itx files
 * sourced from sanskritdocuments.org (volunteer-transcribed, personal study use).
 *
 * Place the three files relative to project root:
 *   ../kena.itx.txt
 *   ../mundaka.itx.txt
 *   ../taitaccent.itx.txt
 *
 * Verse counts are logged on first run — add to canonical-counts.ts after verification.
 *
 * Run: npx tsx --env-file=.env.local scripts/ingest-local-upanishads.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseItxKena, parseItxMundaka, parseItxTaittiriya } from './lib/vedic-text-parser'
import { makeClients, ingestSource } from './lib/ingest-helpers'

const ROOT = resolve(__dirname, '../../')

const LOCAL_TEXTS = [
  {
    key: 'kena_upanishad',
    file: resolve(ROOT, 'kena.itx.txt'),
    parse: parseItxKena,
    expectedCount: 35,
  },
  {
    key: 'mundaka_upanishad',
    file: resolve(ROOT, 'mundaka.itx.txt'),
    parse: parseItxMundaka,
    expectedCount: 64,
  },
  {
    key: 'taittiriya_upanishad',
    file: resolve(ROOT, 'taitaccent.itx.txt'),
    parse: parseItxTaittiriya,
    expectedCount: 31,
  },
]

async function main() {
  const { embeddingModel, supabase } = makeClients()

  for (const { key, file, parse, expectedCount } of LOCAL_TEXTS) {
    console.log(`\n── ${key} ──`)
    console.log(`  Reading ${file}`)

    let rawText: string
    try {
      rawText = readFileSync(file, 'utf-8')
    } catch (err) {
      console.error(`  Could not read file: ${err}`)
      continue
    }

    const verses = parse(rawText)
    console.log(`  Parsed ${verses.length} verses (expected ${expectedCount})`)

    if (verses.length !== expectedCount) {
      console.error(
        `  COUNT MISMATCH — expected ${expectedCount}, got ${verses.length}.`,
        `\n  If this count is correct for this edition, update canonical-counts.ts and re-run.`
      )
      continue
    }

    await ingestSource(key, verses, expectedCount, embeddingModel, supabase)
  }

  console.log('\nLocal Upanishad ingestion complete.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
