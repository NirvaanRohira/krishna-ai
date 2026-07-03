import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/retrieval/dense', () => ({ denseRetrieve: vi.fn() }))
vi.mock('@/lib/retrieval/sparse', () => ({ sparseRetrieve: vi.fn() }))

const DENSE_RESULTS = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'a', theme_tags: [], similarity: 0.92 },
  { id: 2, text_source: 'bhagavad_gita', book_chapter: 3, verse: 19, text: 'b', theme_tags: [], similarity: 0.85 },
]
const SPARSE_RESULTS = [
  { id: 2, text_source: 'bhagavad_gita', book_chapter: 3, verse: 19, text: 'b', theme_tags: [], rank: 0.9 },
  { id: 3, text_source: 'bhagavad_gita', book_chapter: 4, verse: 7, text: 'c', theme_tags: [], rank: 0.7 },
]

describe('parallelRetrieve', () => {
  let denseRetrieve: ReturnType<typeof vi.fn>
  let sparseRetrieve: ReturnType<typeof vi.fn>
  const mockSupabase = {} as SupabaseClient

  beforeEach(async () => {
    vi.clearAllMocks()
    const dense = await import('@/lib/retrieval/dense')
    const sparse = await import('@/lib/retrieval/sparse')
    denseRetrieve = vi.mocked(dense.denseRetrieve)
    sparseRetrieve = vi.mocked(sparse.sparseRetrieve)
    denseRetrieve.mockResolvedValue(DENSE_RESULTS)
    sparseRetrieve.mockResolvedValue(SPARSE_RESULTS)
  })

  it('calls both denseRetrieve and sparseRetrieve', async () => {
    const { parallelRetrieve } = await import('@/lib/retrieval/parallelRetrieval')
    await parallelRetrieve('karma', { supabaseClient: mockSupabase })
    expect(denseRetrieve).toHaveBeenCalledOnce()
    expect(sparseRetrieve).toHaveBeenCalledOnce()
  })

  it('dispatches both calls with the same query', async () => {
    const { parallelRetrieve } = await import('@/lib/retrieval/parallelRetrieval')
    await parallelRetrieve('dharma duty', { supabaseClient: mockSupabase })
    expect(denseRetrieve).toHaveBeenCalledWith('dharma duty', expect.anything())
    expect(sparseRetrieve).toHaveBeenCalledWith('dharma duty', expect.anything())
  })

  it('returns RRF-merged results', async () => {
    const { parallelRetrieve } = await import('@/lib/retrieval/parallelRetrieval')
    const results = await parallelRetrieve('karma', { supabaseClient: mockSupabase })
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toHaveProperty('score')
  })

  it('id=2 ranks first because it appears in both lists', async () => {
    const { parallelRetrieve } = await import('@/lib/retrieval/parallelRetrieval')
    const results = await parallelRetrieve('karma', { supabaseClient: mockSupabase })
    expect(results[0].id).toBe(2)
  })

  it('degrades to sparse-only when the dense leg rejects (embedding failure)', async () => {
    // A Gemini embedding failure in the dense leg must NOT throw away good sparse (DB-only) results.
    denseRetrieve.mockRejectedValue(new Error('embed timeout'))
    const { parallelRetrieve } = await import('@/lib/retrieval/parallelRetrieval')
    const results = await parallelRetrieve('karma', { supabaseClient: mockSupabase })
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    // Only sparse ids should survive
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual([2, 3])
  })

  it('degrades to dense-only when the sparse leg rejects (DB failure)', async () => {
    sparseRetrieve.mockRejectedValue(new Error('db error'))
    const { parallelRetrieve } = await import('@/lib/retrieval/parallelRetrieval')
    const results = await parallelRetrieve('karma', { supabaseClient: mockSupabase })
    expect(results.length).toBeGreaterThan(0)
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual([1, 2])
  })

  it('returns empty array when both legs reject', async () => {
    denseRetrieve.mockRejectedValue(new Error('embed timeout'))
    sparseRetrieve.mockRejectedValue(new Error('db error'))
    const { parallelRetrieve } = await import('@/lib/retrieval/parallelRetrieval')
    const results = await parallelRetrieve('karma', { supabaseClient: mockSupabase })
    expect(results).toEqual([])
  })

  it('runs dense and sparse concurrently (both called before either resolves)', async () => {
    let denseStarted = false
    let sparseStarted = false
    let denseResolve: () => void
    let sparseResolve: () => void

    denseRetrieve.mockImplementation(() => new Promise<typeof DENSE_RESULTS>((res) => {
      denseStarted = true
      denseResolve = () => res(DENSE_RESULTS)
    }))
    sparseRetrieve.mockImplementation(() => new Promise<typeof SPARSE_RESULTS>((res) => {
      sparseStarted = true
      sparseResolve = () => res(SPARSE_RESULTS)
    }))

    const { parallelRetrieve } = await import('@/lib/retrieval/parallelRetrieval')
    const promise = parallelRetrieve('test', { supabaseClient: mockSupabase })

    await Promise.resolve()
    expect(denseStarted).toBe(true)
    expect(sparseStarted).toBe(true)

    denseResolve!()
    sparseResolve!()
    await promise
  })
})
