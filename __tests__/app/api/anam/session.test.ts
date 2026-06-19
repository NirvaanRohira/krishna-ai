import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeMockSupabase(user: object | null = { id: 'user-123' }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  }
}

function makeRequest() {
  return new Request('http://localhost/api/anam/session', { method: 'POST' })
}

describe('POST /api/anam/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ANAM_API_KEY', 'test-anam-key')
    vi.stubEnv('ANAM_PERSONA_ID', 'test-persona-id')
    vi.stubEnv('ANAM_AVATAR_ID', 'test-avatar-id')
    vi.stubEnv('ANAM_VOICE_ID', 'test-voice-id')
    vi.stubEnv('ANAM_PERSONA_NAME', 'Krishna')
  })

  it('returns 401 when user is not authenticated', async () => {
    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(
      makeMockSupabase(null) as never
    )
    const { POST } = await import('@/app/api/anam/session/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns sessionToken when Anam API call succeeds', async () => {
    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(
      makeMockSupabase() as never
    )
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessionToken: 'anam-session-token-abc' }),
    })
    const { POST } = await import('@/app/api/anam/session/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionToken).toBe('anam-session-token-abc')
  })

  it('calls Anam API with correct Authorization header', async () => {
    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(
      makeMockSupabase() as never
    )
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessionToken: 'tok' }),
    })
    const { POST } = await import('@/app/api/anam/session/route')
    await POST(makeRequest())
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('anam.ai')
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-anam-key')
  })

  it('sends persona config in request body', async () => {
    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(
      makeMockSupabase() as never
    )
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessionToken: 'tok' }),
    })
    const { POST } = await import('@/app/api/anam/session/route')
    await POST(makeRequest())
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(opts.body as string)
    expect(body.personaConfig.personaId).toBe('test-persona-id')
    expect(body.personaConfig.avatarId).toBe('test-avatar-id')
    expect(body.personaConfig.voiceId).toBe('test-voice-id')
  })

  it('returns 500 when Anam API call fails', async () => {
    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(
      makeMockSupabase() as never
    )
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) })
    const { POST } = await import('@/app/api/anam/session/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
  })
})
