import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const FAKE_USER_ID = 'user-abc-123'
const FAKE_SESSION_ID = 'sess-xyz-456'

function makeSupabaseMock() {
  const mockSingle = vi.fn().mockResolvedValue({ data: { id: FAKE_SESSION_ID }, error: null })
  const mockSelectChain = vi.fn(() => ({ single: mockSingle }))
  const mockSessionInsert = vi.fn(() => ({ select: mockSelectChain }))

  // endSession now guards on `ended_at is null` and selects the affected row:
  //   .update({...}).eq('id', sessionId).is('ended_at', null).select('id')
  const mockUpdateSelect = vi.fn().mockResolvedValue({ data: [{ id: FAKE_SESSION_ID }], error: null })
  const mockIs = vi.fn(() => ({ select: mockUpdateSelect }))
  const mockEq = vi.fn(() => ({ is: mockIs }))
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
    mockIs,
    mockUpdateSelect,
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

  it('only ends a session that has not already ended (ended_at is null)', async () => {
    const { supabase, mockIs } = makeSupabaseMock()
    const { endSession } = await import('@/lib/session')
    await endSession(supabase, FAKE_SESSION_ID)
    expect(mockIs).toHaveBeenCalledWith('ended_at', null)
  })

  it('returns true when a row was newly ended', async () => {
    const { supabase } = makeSupabaseMock()
    const { endSession } = await import('@/lib/session')
    const newlyEnded = await endSession(supabase, FAKE_SESSION_ID)
    expect(newlyEnded).toBe(true)
  })

  it('returns false when the session was already ended (no rows affected)', async () => {
    const { supabase, mockUpdateSelect } = makeSupabaseMock()
    mockUpdateSelect.mockResolvedValue({ data: [], error: null })
    const { endSession } = await import('@/lib/session')
    const newlyEnded = await endSession(supabase, FAKE_SESSION_ID)
    expect(newlyEnded).toBe(false)
  })

  it('throws when the update returns an error', async () => {
    const { supabase, mockUpdateSelect } = makeSupabaseMock()
    mockUpdateSelect.mockResolvedValue({ data: null, error: { message: 'update failed' } })
    const { endSession } = await import('@/lib/session')
    await expect(endSession(supabase, FAKE_SESSION_ID)).rejects.toThrow('update failed')
  })
})

describe('resumeSession', () => {
  function mockSupabase(session: object | null, rows: object[]) {
    const sessionsChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: session, error: null }) }
    const messagesChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: rows, error: null }) }
    return { from: vi.fn((t: string) => (t === 'sessions' ? sessionsChain : messagesChain)) }
  }
  const ID = '3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'

  it('returns null for a non-uuid id without querying', async () => {
    const { resumeSession } = await import('@/lib/session')
    const sb = mockSupabase(null, [])
    expect(await resumeSession(sb as never, 'not-a-uuid', 12)).toBeNull()
    expect(sb.from).not.toHaveBeenCalled()
  })

  it("returns null when the session is not visible (someone else's) or has ended", async () => {
    const { resumeSession } = await import('@/lib/session')
    expect(await resumeSession(mockSupabase(null, []) as never, ID, 12)).toBeNull()
    expect(await resumeSession(mockSupabase({ id: ID, turn_count: 3, ended_at: '2026-10-01' }, []) as never, ID, 12)).toBeNull()
  })

  it('returns history oldest-first for an active owned session', async () => {
    const { resumeSession } = await import('@/lib/session')
    const rows = [{ role: 'assistant', content: 'b' }, { role: 'user', content: 'a' }] // DB returns newest first
    const r = await resumeSession(mockSupabase({ id: ID, turn_count: 1, ended_at: null }, rows) as never, ID, 12)
    expect(r).toEqual({ id: ID, turnCount: 1, history: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] })
  })
})
