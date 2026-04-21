import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LookupResult {
  id: number
  label: string
  intent_keywords: string[]
  text_source: string
  book_chapter: number
  verse_start: number
  verse_end: number
}

export async function queryStructuralLookup(
  keywords: string[],
  options?: { supabaseClient?: SupabaseClient }
): Promise<LookupResult[]> {
  if (keywords.length === 0) return []

  const supabase = options?.supabaseClient ?? await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('structural_lookup')
    .select('*')
    .overlaps('intent_keywords', keywords)

  if (error) throw new Error(error.message)
  return (data ?? []) as LookupResult[]
}
