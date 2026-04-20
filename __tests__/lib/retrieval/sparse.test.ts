import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const FAKE_ROWS = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 3, verse: 37, text: 'kama esha krodha esha...', theme_tags: ['desire', 'anger'], rank: 0.91 },
  { id: 2, text_source: 'bhagavad_gita', book_chapter: 2, verse: 62, text: 'dhyayato visayan...', theme_tags: ['desire'], rank: 0.75 },
]

describe('sparseRetrieve', () => {
  let mockRpc: ReturnType<typeof vi.fn>
  let mockSupabase: Partial<SupabaseClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc = vi.fn().mockResolvedValue({ data: FAKE_ROWS, error: null })
    mockSupabase = { rpc: mockRpc } as unknown as Partial<SupabaseClient>
  })

  it('returns rows with rank scores', async () => {
    const { sparseRetrieve } = await import('@/lib/retrieval/sparse')
    const results = await sparseRetrieve('karma anger', { supabaseClient: mockSupabase as SupabaseClient })
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ book_chapter: 3, verse: 37, rank: 0.91 })
  })

  it('calls the match_corpus_fts rpc with the query string', async () => {
    const { sparseRetrieve } = await import('@/lib/retrieval/sparse')
    await sparseRetrieve('karma anger', { supabaseClient: mockSupabase as SupabaseClient })
    expect(mockRpc).toHaveBeenCalledWith('match_corpus_fts', expect.objectContaining({ query_text: 'karma anger' }))
  })

  it('defaults to 5 results', async () => {
    const { sparseRetrieve } = await import('@/lib/retrieval/sparse')
    await sparseRetrieve('dharma', { supabaseClient: mockSupabase as SupabaseClient })
    expect(mockRpc).toHaveBeenCalledWith('match_corpus_fts', expect.objectContaining({ match_count: 5 }))
  })

  it('respects custom topN', async () => {
    const { sparseRetrieve } = await import('@/lib/retrieval/sparse')
    await sparseRetrieve('dharma', { topN: 10, supabaseClient: mockSupabase as SupabaseClient })
    expect(mockRpc).toHaveBeenCalledWith('match_corpus_fts', expect.objectContaining({ match_count: 10 }))
  })

  it('returns empty array when no FTS matches', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const { sparseRetrieve } = await import('@/lib/retrieval/sparse')
    const results = await sparseRetrieve('xyznotaword', { supabaseClient: mockSupabase as SupabaseClient })
    expect(results).toHaveLength(0)
  })

  it('throws when supabase returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'fts failed' } })
    const { sparseRetrieve } = await import('@/lib/retrieval/sparse')
    await expect(sparseRetrieve('test', { supabaseClient: mockSupabase as SupabaseClient })).rejects.toThrow('fts failed')
  })
})
