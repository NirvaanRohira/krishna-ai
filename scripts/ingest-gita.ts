import { readFileSync } from 'fs'
import { join } from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { parseGitaHtml } from './lib/gretil-parser'
import { validateAndIngest } from './lib/ingest-pipeline'
import { tagVerse } from './lib/keyword-tagger'

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 8): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      if (attempt >= maxAttempts) break
      if (err?.status === 429) {
        const d = err?.errorDetails?.find((x: any) => x['@type']?.includes('RetryInfo'))
        const waitMs = d?.retryDelay ? parseInt(d.retryDelay) * 1000 + 2000 : 65000
        console.log(`  429 rate limit — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt})`)
        await new Promise((r) => setTimeout(r, waitMs))
      } else if (
        err?.message?.includes('fetch failed') ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT'
      ) {
        const waitMs = Math.min(2000 * attempt, 30000)
        console.log(`  Network error — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt})`)
        await new Promise((r) => setTimeout(r, waitMs))
      } else {
        throw err
      }
    }
  }
  throw lastErr
}

async function main() {
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

  const html = readFileSync(join(__dirname, 'data/raw/bhagavad_gita_gretil.htm'), 'utf-8')
  const allVerses = parseGitaHtml(html)
  console.log(`Parsed ${allVerses.length} verses from GRETIL`)

  // Resume mode: skip verses that already have embeddings in Supabase
  const { data: existing } = await supabase
    .from('krishna_corpus')
    .select('book_chapter, verse')
    .eq('text_source', 'bhagavad_gita')
    .not('embedding', 'is', null)

  const doneKeys = new Set((existing ?? []).map((r: any) => `${r.book_chapter}:${r.verse}`))
  const verses = allVerses.filter((v) => !doneKeys.has(`${v.chapter}:${v.verse}`))

  if (verses.length === 0) {
    console.log('All 700 verses already embedded. Nothing to do.')
    return
  }
  console.log(`Resuming: ${verses.length} verses to embed (${doneKeys.size} already done)`)

  await validateAndIngest(verses, {
    textSource: 'bhagavad_gita',
    canonicalCount: verses.length,
    batchSize: 5,
    batchDelayMs: 4000,

    async tag(text) {
      return tagVerse(text)
    },

    async embed(text) {
      return withRetry(async () => {
        const result = await embeddingModel.embedContent(text)
        return result.embedding.values
      })
    },

    async upsert(rows) {
      const { error } = await supabase.from('krishna_corpus').upsert(
        rows.map((r) => ({
          text_source: r.text_source,
          book_chapter: r.book_chapter,
          verse: r.verse,
          text: r.text,
          theme_tags: r.theme_tags,
          embedding: r.embedding,
        })),
        { onConflict: 'text_source,book_chapter,verse' }
      )
      if (error) throw error
      const last = rows[rows.length - 1]
      console.log(`  batch done — ch${last.book_chapter}:v${last.verse} (${rows.length} rows)`)
    },
  })

  console.log('Ingestion complete.')
}

main().catch((err) => {
  console.error('Ingestion failed:', err)
  process.exit(1)
})
