import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/session', () => ({ endSession: vi.fn() }))
vi.mock('@/lib/memory/sessionExtractor', () => ({ extractSessionProfile: vi.fn() }))
vi.mock('@/lib/memory/dharmaProfileExtractor', () => ({ updateDharmaProfile: vi.fn() }))

function chain(result: object) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'neq', 'order']) c[m] = vi.fn(() => c)
  c.limit = vi.fn().mockResolvedValue(result)
  c.then = (res: (v: unknown) => void) => res(result)
  return c
}

describe('post-session memory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('builds the profile from the transcript stored in the DB', async () => {
    const { extractSessionProfile } = await import('@/lib/memory/sessionExtractor')
    const { updateDharmaProfile } = await import('@/lib/memory/dharmaProfileExtractor')
    vi.mocked(extractSessionProfile).mockResolvedValue({ life_context: 'new parent' })
    const sb = { from: vi.fn(() => chain({ data: [{ role: 'user', content: 'I just had a baby' }, { role: 'assistant', content: 'Congratulations' }] })) }
    const { extractAndStoreProfile } = await import('@/lib/memory/postSession')
    await extractAndStoreProfile(sb as never, 's1', 'u1')
    expect(vi.mocked(extractSessionProfile).mock.calls[0][0]).toContain('user: I just had a baby')
    expect(updateDharmaProfile).toHaveBeenCalledWith('u1', { life_context: 'new parent' }, sb)
  })

  it('closes and extracts sessions left open, but only ones this call actually ended', async () => {
    const { endSession } = await import('@/lib/session')
    const { extractSessionProfile } = await import('@/lib/memory/sessionExtractor')
    vi.mocked(extractSessionProfile).mockResolvedValue({})
    vi.mocked(endSession).mockResolvedValueOnce(true).mockResolvedValueOnce(false) // 2nd already ended by a late beacon
    const openSessions = { data: [{ id: 'old-1' }, { id: 'old-2' }] }
    const transcript = { data: [{ role: 'user', content: 'hi' }] }
    const sb = { from: vi.fn((t: string) => chain(t === 'sessions' ? openSessions : transcript)) }
    const { closeStaleSessions } = await import('@/lib/memory/postSession')
    const n = await closeStaleSessions(sb as never, 'u1', 'current')
    expect(n).toBe(1)
    expect(endSession).toHaveBeenCalledTimes(2)
    expect(extractSessionProfile).toHaveBeenCalledTimes(1)
  })
})
