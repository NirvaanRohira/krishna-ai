import { createServerSupabaseClient } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SparseResult {
  id: number
  text_source: string
  book_chapter: number
  verse: number
  text: string
  theme_tags: string[]
  rank: number
}

export async function sparseRetrieve(
  query: string,
  options?: { topN?: number; supabaseClient?: SupabaseClient }
): Promise<SparseResult[]> {
  const topN = options?.topN ?? 5
  const supabase = options?.supabaseClient ?? await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('match_corpus_fts', {
    query_text: query,
    match_count: topN,
  })

  if (error) throw new Error(error.message)
  return (data ?? []) as SparseResult[]
}
