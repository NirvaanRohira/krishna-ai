/**
 * Re-embeds all krishna_corpus rows at vector(1536) using batchEmbedContents.
 * Reads text directly from Supabase — no source files needed.
 * 100 texts per Gemini call, batch upsert back to Supabase, both with retry.
 * Resume-safe: only fetches rows where embedding IS NULL.
 *
 * Run: npx tsx --env-file=.env.local scripts/reembed-corpus.ts
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { withRetry } from './lib/ingest-helpers'

const OUTPUT_DIM = 1536
const EMBED_BATCH = 100   // rows per Gemini batchEmbedContents call
const UPSERT_BATCH = 10   // rows per Supabase upsert (keeps statement under timeout)
const DELAY_MS = 1000

function makeClients() {
  const geminiKey = process.env.GEMINI_API_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!geminiKey || !supabaseUrl || !supabaseKey) {
    console.error('Missing env vars: GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const genAI = new GoogleGenerativeAI(geminiKey)
  const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })
  const supabase = createClient(supabaseUrl, supabaseKey)
  return { embeddingModel, supabase }
}

type Row = {
  id: number
  text: string
  text_source: string
  book_chapter: number
  verse: number
  theme_tags: string[]
}

async function fetchNullEmbeddingRows(supabase: ReturnType<typeof createClient>): Promise<Row[]> {
  const PAGE = 1000
  const rows: Row[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('krishna_corpus')
      .select('id, text, text_source, book_chapter, verse, theme_tags')
      .is('embedding', null)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

async function upsertWithRetry(
  supabase: ReturnType<typeof createClient>,
  rows: Array<Row & { embedding: number[] }>
) {
  await withRetry(async () => {
    const { error } = await supabase
      .from('krishna_corpus')
      .upsert(rows, { onConflict: 'text_source,book_chapter,verse' })
    if (error) throw Object.assign(new Error(error.message), { status: undefined })
  })
}

async function main() {
  const { embeddingModel, supabase } = makeClients()

  console.log('\nFetching rows with null embeddings from Supabase...')
  const rows = await fetchNullEmbeddingRows(supabase)
  console.log(`Found ${rows.length} rows to re-embed at dim=${OUTPUT_DIM}`)

  if (rows.length === 0) {
    console.log('Nothing to do — all rows already have embeddings.')
    return
  }

  let done = 0

  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const chunk = rows.slice(i, i + EMBED_BATCH)

    const embedResult = await withRetry(() =>
      embeddingModel.batchEmbedContents({
        requests: chunk.map(r => ({
          content: { parts: [{ text: r.text }] },
          outputDimensionality: OUTPUT_DIM,
        } as Parameters<typeof embeddingModel.embedContent>[0])),
      })
    )

    const upsertRows = chunk.map((r, j) => ({
      ...r,
      embedding: embedResult.embeddings[j].values,
    }))

    for (let j = 0; j < upsertRows.length; j += UPSERT_BATCH) {
      await upsertWithRetry(supabase, upsertRows.slice(j, j + UPSERT_BATCH))
    }

    done += chunk.length
    console.log(`  ${done} / ${rows.length} embedded`)

    if (i + EMBED_BATCH < rows.length) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  console.log('\nRe-embedding complete.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
