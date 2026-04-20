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
