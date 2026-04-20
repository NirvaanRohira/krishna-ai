import { embedText } from '@/lib/gemini'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface DenseResult {
  id: number
  text_source: string
  book_chapter: number
  verse: number
  text: string
  theme_tags: string[]
  similarity: number
}

export async function denseRetrieve(
  query: string,
  options?: { topN?: number; supabaseClient?: SupabaseClient }
): Promise<DenseResult[]> {
  const topN = options?.topN ?? 5
  const supabase = options?.supabaseClient ?? await createServerSupabaseClient()

  const queryEmbedding = await embedText(query)

  const { data, error } = await supabase.rpc('match_corpus', {
    query_embedding: queryEmbedding,
    match_count: topN,
  })

  if (error) throw new Error(error.message)

  return data as DenseResult[]
}
