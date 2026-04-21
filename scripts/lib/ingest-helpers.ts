import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { tagVerse } from './keyword-tagger'
import type { ParsedVerse } from './gretil-parser'

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 8): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      lastErr = err
      if (attempt >= maxAttempts) break
      const anyErr = err as Record<string, unknown>
      if (anyErr?.status === 429) {
        const details = anyErr?.errorDetails as Array<Record<string, string>> | undefined
        const d = details?.find(x => String(x['@type']).includes('RetryInfo'))
        const waitMs = d?.retryDelay ? parseInt(d.retryDelay) * 1000 + 2000 : 65000
        console.log(`  429 rate limit — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt})`)
        await new Promise(r => setTimeout(r, waitMs))
      } else if (
        String(anyErr?.message).includes('fetch failed') ||
        anyErr?.code === 'ECONNRESET' ||
        anyErr?.code === 'ETIMEDOUT'
      ) {
        const waitMs = Math.min(2000 * attempt, 30000)
        console.log(`  Network error — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt})`)
        await new Promise(r => setTimeout(r, waitMs))
      } else {
        throw err
      }
    }
  }
  throw lastErr
}

export function makeClients() {
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

type EmbeddingModel = ReturnType<GoogleGenerativeAI['getGenerativeModel']>
type SupabaseClient = ReturnType<typeof createClient>

export async function ingestSource(
  textSource: string,
  verses: ParsedVerse[],
  canonicalCount: number,
  embeddingModel: EmbeddingModel,
  supabase: SupabaseClient
) {
  // Resume mode: paginate to get ALL already-embedded verses.
  // PostgREST max_rows=1000 is a server-side cap — .limit() alone can't exceed it.
  type ExistingRow = { book_chapter: number; verse: number }
  const doneKeys = new Set<string>()
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data: page } = await supabase
      .from('krishna_corpus')
      .select('book_chapter, verse')
      .eq('text_source', textSource)
      .not('embedding', 'is', null)
      .range(from, from + PAGE - 1)
    if (!page || page.length === 0) break
    for (const r of page as ExistingRow[]) doneKeys.add(`${r.book_chapter}:${r.verse}`)
    if (page.length < PAGE) break
    from += PAGE
  }
  // Deduplicate by chapter:verse — keep last occurrence (later in file wins)
  const deduped = [...new Map(verses.map(v => [`${v.chapter}:${v.verse}`, v])).values()]
  const toEmbed = deduped.filter(v => !doneKeys.has(`${v.chapter}:${v.verse}`))

  if (toEmbed.length === 0) {
    console.log(`[${textSource}] All ${verses.length} verses already embedded. Nothing to do.`)
    return
  }

  console.log(`[${textSource}] Resuming: ${toEmbed.length} to embed (${doneKeys.size} already done)`)

  // Paid tier: batchEmbedContents sends up to 100 texts per API call.
  // ~130 calls for 13k Bhagavatam shlokas vs ~2,600 single calls at 4s each.
  const EMBED_BATCH = 100
  const DELAY_MS = 1000

  for (let i = 0; i < toEmbed.length; i += EMBED_BATCH) {
    const chunk = toEmbed.slice(i, i + EMBED_BATCH)

    const embedResult = await withRetry(() =>
      embeddingModel.batchEmbedContents({
        requests: chunk.map(v => ({ content: { parts: [{ text: v.text }] } })),
      })
    )

    const rows = chunk.map((v, j) => ({
      text_source: textSource,
      book_chapter: v.chapter,
      verse: v.verse,
      text: v.text,
      theme_tags: tagVerse(v.text),
      embedding: embedResult.embeddings[j].values,
    }))

    const { error } = await supabase
      .from('krishna_corpus')
      .upsert(rows, { onConflict: 'text_source,book_chapter,verse' })
    if (error) throw error

    const last = rows[rows.length - 1]
    console.log(`  [${textSource}] batch done — ch${last.book_chapter}:v${last.verse} (${rows.length} rows)`)

    if (i + EMBED_BATCH < toEmbed.length) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  console.log(`[${textSource}] Ingestion complete.`)
}
