import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ endSession: vi.fn() }))
vi.mock('@/lib/memory/sessionExtractor', () => ({ extractSessionProfile: vi.fn() }))
vi.mock('@/lib/memory/dharmaProfileExtractor', () => ({ updateDharmaProfile: vi.fn() }))

const FAKE_USER = { id: 'user-abc-123' }
const FAKE_SESSION_ID = 'sess-xyz-456'

function makeRequest(body: object) {
  return new Request('http://localhost/api/session/end', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeMockSupabase(user: object | null = FAKE_USER) {
  const msgChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: [
        { role: 'user', content: 'I feel lost' },
        { role: 'assistant', content: 'The Gita teaches...' },
      ],
      error: null,
    }),
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockReturnValue(msgChain),
  }
}

describe('POST /api/session/end — memory extraction', () => {
  let extractSessionProfile: ReturnType<typeof vi.fn>
  let updateDharmaProfile: ReturnType<typeof vi.fn>
  let endSession: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const session = await import('@/lib/session')
    endSession = vi.mocked(session.endSession)
    endSession.mockResolvedValue(undefined)

    const extractor = await import('@/lib/memory/sessionExtractor')
    extractSessionProfile = vi.mocked(extractor.extractSessionProfile)
    extractSessionProfile.mockResolvedValue({ life_context: 'feeling lost' })

    const dharma = await import('@/lib/memory/dharmaProfileExtractor')
    updateDharmaProfile = vi.mocked(dharma.updateDharmaProfile)
    updateDharmaProfile.mockResolvedValue(undefined)

    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(makeMockSupabase() as never)
  })

  it('still returns 200 immediately (extraction is background)', async () => {
    const { POST } = await import('@/app/api/session/end/route')
    const res = await POST(makeRequest({ sessionId: FAKE_SESSION_ID }))
    expect(res.status).toBe(200)
  })

  it('calls extractSessionProfile with session transcript', async () => {
    const { POST } = await import('@/app/api/session/end/route')
    await POST(makeRequest({ sessionId: FAKE_SESSION_ID }))
    // Give background work a tick to run in test environment
    await new Promise(r => setTimeout(r, 10))
    expect(extractSessionProfile).toHaveBeenCalled()
    const transcript = extractSessionProfile.mock.calls[0][0] as string
    expect(transcript).toContain('I feel lost')
  })

  it('calls updateDharmaProfile with extracted profile and userId', async () => {
    const { POST } = await import('@/app/api/session/end/route')
    await POST(makeRequest({ sessionId: FAKE_SESSION_ID }))
    await new Promise(r => setTimeout(r, 10))
    expect(updateDharmaProfile).toHaveBeenCalledWith(
      FAKE_USER.id,
      expect.objectContaining({ life_context: 'feeling lost' }),
      expect.anything()
    )
  })
})
