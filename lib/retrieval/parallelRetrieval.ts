import { denseRetrieve } from '@/lib/retrieval/dense'
import { sparseRetrieve } from '@/lib/retrieval/sparse'
import { rrfMerge, type RRFResult } from '@/lib/retrieval/rrfMerge'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function parallelRetrieve(
  query: string,
  options?: { topN?: number; supabaseClient?: SupabaseClient }
): Promise<RRFResult[]> {
  const [dense, sparse] = await Promise.all([
    denseRetrieve(query, options),
    sparseRetrieve(query, options),
  ])
  return rrfMerge(dense, sparse)
}
