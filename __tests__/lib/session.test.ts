import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const FAKE_USER_ID = 'user-abc-123'
const FAKE_SESSION_ID = 'sess-xyz-456'

function makeSupabaseMock() {
  const mockSingle = vi.fn().mockResolvedValue({ data: { id: FAKE_SESSION_ID }, error: null })
  const mockSelectChain = vi.fn(() => ({ single: mockSingle }))
  const mockSessionInsert = vi.fn(() => ({ select: mockSelectChain }))

  const mockEq = vi.fn().mockResolvedValue({ error: null })
  const mockSessionUpdate = vi.fn(() => ({ eq: mockEq }))

  const mockMessageInsert = vi.fn().mockResolvedValue({ error: null })

  const mockFrom = vi.fn((table: string) => {
    if (table === 'sessions') return { insert: mockSessionInsert, update: mockSessionUpdate }
    if (table === 'messages') return { insert: mockMessageInsert }
    return {}
  })

  const mockRpc = vi.fn().mockResolvedValue({ error: null })

  return {
    supabase: { from: mockFrom, rpc: mockRpc } as unknown as SupabaseClient,
    mockSingle,
    mockSessionInsert,
    mockMessageInsert,
    mockEq,
    mockRpc,
    mockFrom,
  }
}

describe('startSession', () => {
  it('returns the new session id', async () => {
    const { supabase } = makeSupabaseMock()
    const { startSession } = await import('@/lib/session')
    const id = await startSession(supabase, FAKE_USER_ID)
    expect(id).toBe(FAKE_SESSION_ID)
  })

  it('inserts a row in sessions with the correct user_id', async () => {
    const { supabase, mockSessionInsert } = makeSupabaseMock()
    const { startSession } = await import('@/lib/session')
    await startSession(supabase, FAKE_USER_ID)
    expect(mockSessionInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: FAKE_USER_ID }))
  })

  it('throws when the insert returns an error', async () => {
    const { supabase, mockSingle } = makeSupabaseMock()
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const { startSession } = await import('@/lib/session')
    await expect(startSession(supabase, FAKE_USER_ID)).rejects.toThrow('DB error')
  })
})

describe('saveExchange', () => {
  const SOURCES = [{ id: 1, text: 'karmanye...', book_chapter: 2, verse: 47 }]

  it('inserts two rows: one user message and one assistant message', async () => {
    const { supabase, mockMessageInsert } = makeSupabaseMock()
    const { saveExchange } = await import('@/lib/session')
    await saveExchange(supabase, FAKE_SESSION_ID, 'my question', 'yogi answer', SOURCES)
    const rows = mockMessageInsert.mock.calls[0][0] as object[]
    expect(rows).toHaveLength(2)
  })

  it('user row has role="user" and the correct content', async () => {
    const { supabase, mockMessageInsert } = makeSupabaseMock()
    const { saveExchange } = await import('@/lib/session')
    await saveExchange(supabase, FAKE_SESSION_ID, 'my question', 'yogi answer', SOURCES)
    const rows = mockMessageInsert.mock.calls[0][0] as Array<{ role: string; content: string }>
    const userRow = rows.find((r) => r.role === 'user')
    expect(userRow?.content).toBe('my question')
  })

  it('assistant row has role="assistant", content, and retrieval_context', async () => {
    const { supabase, mockMessageInsert } = makeSupabaseMock()
    const { saveExchange } = await import('@/lib/session')
    await saveExchange(supabase, FAKE_SESSION_ID, 'my question', 'yogi answer', SOURCES)
    const rows = mockMessageInsert.mock.calls[0][0] as Array<{ role: string; content: string; retrieval_context: object }>
    const assistantRow = rows.find((r) => r.role === 'assistant')
    expect(assistantRow?.content).toBe('yogi answer')
    expect(assistantRow?.retrieval_context).toEqual(SOURCES)
  })

  it('increments session turn_count via rpc', async () => {
    const { supabase, mockRpc } = makeSupabaseMock()
    const { saveExchange } = await import('@/lib/session')
    await saveExchange(supabase, FAKE_SESSION_ID, 'q', 'a', SOURCES)
    expect(mockRpc).toHaveBeenCalledWith('increment_session_turn', expect.objectContaining({ p_session_id: FAKE_SESSION_ID }))
  })

  it('throws when message insert returns an error', async () => {
    const { supabase, mockMessageInsert } = makeSupabaseMock()
    mockMessageInsert.mockResolvedValue({ error: { message: 'insert failed' } })
    const { saveExchange } = await import('@/lib/session')
    await expect(saveExchange(supabase, FAKE_SESSION_ID, 'q', 'a', SOURCES)).rejects.toThrow('insert failed')
  })
})

describe('endSession', () => {
  it('updates ended_at on the correct session', async () => {
    const { supabase, mockEq } = makeSupabaseMock()
    const { endSession } = await import('@/lib/session')
    await endSession(supabase, FAKE_SESSION_ID)
    expect(mockEq).toHaveBeenCalledWith('id', FAKE_SESSION_ID)
  })

  it('throws when the update returns an error', async () => {
    const { supabase, mockEq } = makeSupabaseMock()
    mockEq.mockResolvedValue({ error: { message: 'update failed' } })
    const { endSession } = await import('@/lib/session')
    await expect(endSession(supabase, FAKE_SESSION_ID)).rejects.toThrow('update failed')
  })
})
