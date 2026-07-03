import { denseRetrieve } from '@/lib/retrieval/dense'
import { sparseRetrieve } from '@/lib/retrieval/sparse'
import { rrfMerge, type RRFResult } from '@/lib/retrieval/rrfMerge'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function parallelRetrieve(
  query: string,
  options?: { topN?: number; supabaseClient?: SupabaseClient }
): Promise<RRFResult[]> {
  // allSettled (not all) so one leg failing doesn't discard the other's good results.
  // A Gemini embedding failure in the dense leg must not throw away perfectly good
  // sparse (DB-only) results — and vice versa. A failed leg contributes an empty array,
  // which rrfMerge handles fine.
  const [denseResult, sparseResult] = await Promise.allSettled([
    denseRetrieve(query, options),
    sparseRetrieve(query, options),
  ])

  if (denseResult.status === 'rejected') {
    console.error('[parallelRetrieve] dense leg failed — degrading:', denseResult.reason)
  }
  if (sparseResult.status === 'rejected') {
    console.error('[parallelRetrieve] sparse leg failed — degrading:', sparseResult.reason)
  }

  const dense = denseResult.status === 'fulfilled' ? denseResult.value : []
  const sparse = sparseResult.status === 'fulfilled' ? sparseResult.value : []
  return rrfMerge(dense, sparse)
}
