import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/gemini', () => ({
  embedText: vi.fn(),
  EMBEDDING_DIMENSION: 1536,
  generateText: vi.fn(),
  classify: vi.fn(),
}))

const FAKE_VECTOR = new Array(1536).fill(0.2)

function makeMockSupabase(summary: string | null, error: null | { message: string } = null) {
  const single = vi.fn().mockResolvedValue({
    data: error ? null : (summary !== null ? { last_session_summary: summary } : null),
    error,
  })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from, _single: single }
}

describe('getContextVector', () => {
  let embedText: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const gemini = await import('@/lib/gemini')
    embedText = vi.mocked(gemini.embedText)
    embedText.mockResolvedValue(FAKE_VECTOR)
  })

  it('returns an embedding vector when user has a last_session_summary', async () => {
    const { getContextVector } = await import('@/lib/retrieval/contextRetrieval')
    const { from } = makeMockSupabase('user struggles with anger and attachment')
    const result = await getContextVector('user-123', { supabaseClient: { from } as unknown as SupabaseClient })
    expect(result).toEqual(FAKE_VECTOR)
  })

  it('calls embedText with the stored summary', async () => {
    const { getContextVector } = await import('@/lib/retrieval/contextRetrieval')
    const { from } = makeMockSupabase('recurring grief over loss')
    await getContextVector('user-123', { supabaseClient: { from } as unknown as SupabaseClient })
    expect(embedText).toHaveBeenCalledWith('recurring grief over loss')
  })

  it('returns null when user has no last_session_summary', async () => {
    const { getContextVector } = await import('@/lib/retrieval/contextRetrieval')
    const { from } = makeMockSupabase(null)
    const result = await getContextVector('user-123', { supabaseClient: { from } as unknown as SupabaseClient })
    expect(result).toBeNull()
    expect(embedText).not.toHaveBeenCalled()
  })

  it('returns null when user profile row does not exist', async () => {
    const { getContextVector } = await import('@/lib/retrieval/contextRetrieval')
    const single = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const result = await getContextVector('new-user', { supabaseClient: { from } as unknown as SupabaseClient })
    expect(result).toBeNull()
  })

  it('queries user_profiles table by user_id', async () => {
    const { getContextVector } = await import('@/lib/retrieval/contextRetrieval')
    const { from } = makeMockSupabase('some summary')
    await getContextVector('user-abc', { supabaseClient: { from } as unknown as SupabaseClient })
    expect(from).toHaveBeenCalledWith('user_profiles')
  })
})
