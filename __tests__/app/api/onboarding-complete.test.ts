import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))

function makeRequest() {
  return new Request('http://localhost/api/onboarding/complete', { method: 'POST' })
}

describe('POST /api/onboarding/complete', () => {
  let updateMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    updateMock = vi.fn().mockResolvedValue({ error: null })
  })

  function makeSupabase(user: object | null = { id: 'user-123' }) {
    return {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
      from: vi.fn().mockReturnValue({
        upsert: updateMock,
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    }
  }

  it('returns 401 for unauthenticated user', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase(null) as never)
    const { POST } = await import('@/app/api/onboarding/complete/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 200 for authenticated user', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const { POST } = await import('@/app/api/onboarding/complete/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
  })

  it('upserts onboarding_complete = true for the authenticated user', async () => {
    const supabase = makeSupabase()
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabase as never)
    const { POST } = await import('@/app/api/onboarding/complete/route')
    await POST(makeRequest())
    expect(supabase.from).toHaveBeenCalledWith('user_profiles')
  })
})
