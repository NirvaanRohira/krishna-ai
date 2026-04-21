import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const FAKE_ANCHORS = [
  {
    id: 1,
    label: 'Fear of death',
    intent_keywords: ['death', 'die', 'mortality', 'fear'],
    text_source: 'bhagavad_gita',
    book_chapter: 2,
    verse_start: 17,
    verse_end: 30,
  },
  {
    id: 2,
    label: 'Detached action',
    intent_keywords: ['action', 'karma', 'duty', 'detach'],
    text_source: 'bhagavad_gita',
    book_chapter: 3,
    verse_start: 19,
    verse_end: 19,
  },
]

function makeMockSupabase(rows = FAKE_ANCHORS, error: null | { message: string } = null) {
  const overlaps = vi.fn().mockResolvedValue({ data: error ? null : rows, error })
  const select = vi.fn().mockReturnValue({ overlaps })
  const from = vi.fn().mockReturnValue({ select })
  return { from, _overlaps: overlaps }
}

describe('queryStructuralLookup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns matching anchors when keywords overlap', async () => {
    const { queryStructuralLookup } = await import('@/lib/retrieval/structuralLookup')
    const { from } = makeMockSupabase()
    const results = await queryStructuralLookup(['death', 'fear'], {
      supabaseClient: { from } as unknown as SupabaseClient,
    })
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ label: 'Fear of death', book_chapter: 2, verse_start: 17, verse_end: 30 })
  })

  it('queries the structural_lookup table with overlaps on intent_keywords', async () => {
    const { queryStructuralLookup } = await import('@/lib/retrieval/structuralLookup')
    const { from, _overlaps } = makeMockSupabase()
    await queryStructuralLookup(['karma'], { supabaseClient: { from } as unknown as SupabaseClient })
    expect(from).toHaveBeenCalledWith('structural_lookup')
    expect(_overlaps).toHaveBeenCalledWith('intent_keywords', ['karma'])
  })

  it('returns empty array when no anchors match', async () => {
    const { queryStructuralLookup } = await import('@/lib/retrieval/structuralLookup')
    const { from } = makeMockSupabase([])
    const results = await queryStructuralLookup(['xyzunknown'], {
      supabaseClient: { from } as unknown as SupabaseClient,
    })
    expect(results).toHaveLength(0)
  })

  it('returns empty array for empty keywords without querying', async () => {
    const { queryStructuralLookup } = await import('@/lib/retrieval/structuralLookup')
    const { from } = makeMockSupabase()
    const results = await queryStructuralLookup([], {
      supabaseClient: { from } as unknown as SupabaseClient,
    })
    expect(results).toHaveLength(0)
    expect(from).not.toHaveBeenCalled()
  })

  it('throws when supabase returns an error', async () => {
    const { queryStructuralLookup } = await import('@/lib/retrieval/structuralLookup')
    const { from } = makeMockSupabase([], { message: 'table not found' })
    await expect(
      queryStructuralLookup(['death'], { supabaseClient: { from } as unknown as SupabaseClient })
    ).rejects.toThrow('table not found')
  })
})
