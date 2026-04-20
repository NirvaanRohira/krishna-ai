import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/gemini', () => ({
  embedText: vi.fn(),
  EMBEDDING_DIMENSION: 3072,
  generateText: vi.fn(),
  classify: vi.fn(),
}))

const FAKE_EMBEDDING = new Array(3072).fill(0.1)

const FAKE_ROWS = [
  {
    id: 1,
    text_source: 'bhagavad_gita',
    book_chapter: 2,
    verse: 47,
    text: 'karmanye vadhikaraste ma phaleshu kadachana',
    theme_tags: ['karma', 'action'],
    similarity: 0.92,
  },
  {
    id: 2,
    text_source: 'bhagavad_gita',
    book_chapter: 3,
    verse: 19,
    text: 'tasmad asaktah satatam karyam karma samachara',
    theme_tags: ['duty'],
    similarity: 0.87,
  },
]

function makeMockSupabase(rows = FAKE_ROWS, error: null | { message: string } = null) {
  const rpc = vi.fn().mockResolvedValue({ data: error ? null : rows, error })
  return { rpc, _rpc: rpc }
}

describe('denseRetrieve', () => {
  let embedText: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const gemini = await import('@/lib/gemini')
    embedText = vi.mocked(gemini.embedText)
    embedText.mockResolvedValue(FAKE_EMBEDDING)
  })

  it('returns results with book_chapter, verse, text, theme_tags, and similarity', async () => {
    const { denseRetrieve } = await import('@/lib/retrieval/dense')
    const { rpc, _rpc } = makeMockSupabase()
    const results = await denseRetrieve('I feel paralyzed by duty', {
      supabaseClient: { rpc } as unknown as SupabaseClient,
    })
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      book_chapter: 2,
      verse: 47,
      similarity: 0.92,
      theme_tags: ['karma', 'action'],
    })
  })

  it('calls embedText with the exact query string', async () => {
    const { denseRetrieve } = await import('@/lib/retrieval/dense')
    const { rpc } = makeMockSupabase()
    await denseRetrieve('Who am I really', { supabaseClient: { rpc } as unknown as SupabaseClient })
    expect(embedText).toHaveBeenCalledWith('Who am I really')
  })

  it('passes the query embedding to the rpc call', async () => {
    const { denseRetrieve } = await import('@/lib/retrieval/dense')
    const { rpc } = makeMockSupabase()
    await denseRetrieve('test query', { supabaseClient: { rpc } as unknown as SupabaseClient })
    expect(rpc).toHaveBeenCalledWith(
      'match_corpus',
      expect.objectContaining({ query_embedding: FAKE_EMBEDDING })
    )
  })

  it('defaults to returning 5 results', async () => {
    const { denseRetrieve } = await import('@/lib/retrieval/dense')
    const { rpc } = makeMockSupabase()
    await denseRetrieve('test query', { supabaseClient: { rpc } as unknown as SupabaseClient })
    expect(rpc).toHaveBeenCalledWith(
      'match_corpus',
      expect.objectContaining({ match_count: 5 })
    )
  })

  it('respects a custom topN value', async () => {
    const { denseRetrieve } = await import('@/lib/retrieval/dense')
    const { rpc } = makeMockSupabase()
    await denseRetrieve('test query', {
      topN: 10,
      supabaseClient: { rpc } as unknown as SupabaseClient,
    })
    expect(rpc).toHaveBeenCalledWith(
      'match_corpus',
      expect.objectContaining({ match_count: 10 })
    )
  })

  it('throws when supabase returns an error', async () => {
    const { denseRetrieve } = await import('@/lib/retrieval/dense')
    const { rpc } = makeMockSupabase([], { message: 'relation does not exist' })
    await expect(
      denseRetrieve('test query', { supabaseClient: { rpc } as unknown as SupabaseClient })
    ).rejects.toThrow('relation does not exist')
  })
})
