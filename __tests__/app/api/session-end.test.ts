import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ endSession: vi.fn() }))
vi.mock('@/lib/llm', () => ({ generateText: vi.fn(), generateTextStream: vi.fn(), classify: vi.fn() }))

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
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  }
}

describe('POST /api/session/end', () => {
  let endSession: ReturnType<typeof vi.fn>
  let createServerSupabaseClient: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const session = await import('@/lib/session')
    endSession = vi.mocked(session.endSession)
    endSession.mockResolvedValue(undefined)

    const supabaseLib = await import('@/lib/supabase-server')
    createServerSupabaseClient = vi.mocked(supabaseLib.createServerSupabaseClient)
    createServerSupabaseClient.mockResolvedValue(makeMockSupabase() as never)
  })

  it('returns 200 when session is ended successfully', async () => {
    const { POST } = await import('@/app/api/session/end/route')
    const res = await POST(makeRequest({ sessionId: FAKE_SESSION_ID }))
    expect(res.status).toBe(200)
  })

  it('calls endSession with the correct sessionId', async () => {
    const { POST } = await import('@/app/api/session/end/route')
    await POST(makeRequest({ sessionId: FAKE_SESSION_ID }))
    expect(endSession).toHaveBeenCalledWith(expect.anything(), FAKE_SESSION_ID)
  })

  it('returns 401 when user is not authenticated', async () => {
    createServerSupabaseClient.mockResolvedValue(makeMockSupabase(null) as never)
    const { POST } = await import('@/app/api/session/end/route')
    const res = await POST(makeRequest({ sessionId: FAKE_SESSION_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when sessionId is missing', async () => {
    const { POST } = await import('@/app/api/session/end/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('accepts sendBeacon text/plain body and returns 200', async () => {
    const { POST } = await import('@/app/api/session/end/route')
    const req = new Request('http://localhost/api/session/end', {
      method: 'POST',
      body: JSON.stringify({ sessionId: FAKE_SESSION_ID }),
      headers: { 'Content-Type': 'text/plain' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(endSession).toHaveBeenCalledWith(expect.anything(), FAKE_SESSION_ID)
  })
})
