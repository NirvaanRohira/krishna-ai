import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The mobile app's start-up config and "who am I" (docs/MOBILE_PLAN.md).

const supa = { getUser: vi.fn(), profile: vi.fn(), plan: vi.fn() }
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: supa.getUser },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: table === 'user_profiles' ? supa.profile : supa.plan }) }),
    }),
  })),
}))

const env = { ...process.env }
beforeEach(() => vi.clearAllMocks())
afterEach(() => { process.env = { ...env } })

describe('GET /api/app/config', () => {
  it('serves the public Supabase URL and anon key, and a minimum app version', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co/'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.APP_MIN_VERSION_CODE = '3'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-secret'
    const { GET } = await import('@/app/api/app/config/route')
    const res = GET()
    const body = await res.json()
    expect(body).toEqual({ supabase_url: 'https://abc.supabase.co', supabase_anon_key: 'anon-key', min_version_code: 3 })
    expect(JSON.stringify(body)).not.toContain('service-secret')
  })

  it('never hands out a non-https backend', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://abc.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    const { GET } = await import('@/app/api/app/config/route')
    expect(GET().status).toBe(503)
  })
})

describe('GET /api/app/me', () => {
  const call = async () => (await import('@/app/api/app/me/route')).GET()

  it('is 401 without a signed-in user', async () => {
    supa.getUser.mockResolvedValue({ data: { user: null } })
    expect((await call()).status).toBe(401)
  })

  it('reports email, sign-in method, consent for the current terms, and plan', async () => {
    const { TERMS_VERSION } = await import('@/lib/legal')
    supa.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.co', app_metadata: { provider: 'google' } } } })
    supa.profile.mockResolvedValue({ data: { onboarding_complete: true, terms_version: TERMS_VERSION, marketing_opt_in: false }, error: null })
    supa.plan.mockResolvedValue({ data: { plan: 'premium', valid_until: '2999-01-01T00:00:00Z' } })
    expect(await (await call()).json()).toEqual({
      email: 'a@b.co', provider: 'google', onboarded: true, marketing_opt_in: false, plan: 'premium', plan_until: '2999-01-01T00:00:00Z',
    })
  })

  it('old terms, no profile, or an expired pass read as not onboarded / free', async () => {
    supa.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.co', app_metadata: { provider: 'email' } } } })
    supa.profile.mockResolvedValue({ data: { onboarding_complete: true, terms_version: 'old' }, error: null })
    supa.plan.mockResolvedValue({ data: { plan: 'premium', valid_until: '2000-01-01T00:00:00Z' } })
    expect(await (await call()).json()).toMatchObject({ onboarded: false, plan: 'free', plan_until: null })
    supa.profile.mockResolvedValue({ data: null, error: null })
    expect(await (await call()).json()).toMatchObject({ onboarded: false })
  })

  it('a database error is a plain message', async () => {
    supa.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.co', app_metadata: {} } } })
    supa.profile.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation "user_profiles" does not exist' } })
    supa.plan.mockResolvedValue({ data: null })
    const res = await call()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/relation/)
  })
})
