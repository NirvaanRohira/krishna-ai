import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))

const FAKE_USER_PROFILE = { user_id: 'user-1', life_context: 'Feeling lost', previous_guidance: [] }
const FAKE_SPIRITUAL_PROFILE = { user_id: 'user-1', primary_attachments: ['family'], current_life_stage: 'grihastha', recurring_themes: ['duty'] }

function makeSupabase(user: object | null = { id: 'user-1' }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockImplementation((table: string) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: table === 'user_profiles' ? FAKE_USER_PROFILE : FAKE_SPIRITUAL_PROFILE,
          error: null,
        }),
      }
      return chain
    }),
  }
}

describe('GET /api/profile', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase(null) as never)
    const { GET } = await import('@/app/api/profile/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 200 with user_profile and spiritual_profile for authenticated user', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const { GET } = await import('@/app/api/profile/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('user_profile')
    expect(body).toHaveProperty('spiritual_profile')
  })

  it('returns life_context from user_profile', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const { GET } = await import('@/app/api/profile/route')
    const res = await GET()
    const body = await res.json()
    expect(body.user_profile.life_context).toBe('Feeling lost')
  })

  it('returns primary_attachments from spiritual_profile', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const { GET } = await import('@/app/api/profile/route')
    const res = await GET()
    const body = await res.json()
    expect(body.spiritual_profile.primary_attachments).toContain('family')
  })
})
