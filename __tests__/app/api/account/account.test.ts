import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
const adminDelete = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { admin: { deleteUser: adminDelete } } })),
}))

function chain(result: object) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'delete']) c[m] = vi.fn(() => c)
  c.maybeSingle = vi.fn().mockResolvedValue(result)
  c.then = (res: (v: unknown) => void) => res(result)
  return c
}

function makeSupabase(user: object | null = { id: 'u1', email: 'a@b.c', created_at: '2026-01-01' }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }), signOut: vi.fn().mockResolvedValue({}) },
    from: vi.fn(() => chain({ data: [], error: null })),
  }
}

describe('account data rights', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    const { __resetRateLimitStore } = await import('@/lib/rateLimit')
    __resetRateLimitStore()
  })

  it('export requires auth', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase(null) as never)
    const { GET } = await import('@/app/api/account/export/route')
    expect((await GET()).status).toBe(401)
  })

  it('export returns a downloadable JSON of the user’s own data', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const { GET } = await import('@/app/api/account/export/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    const body = JSON.parse(await res.text())
    expect(body.account.id).toBe('u1')
    expect(body).toHaveProperty('sessions')
    expect(body).toHaveProperty('consent_history')
  })

  it('delete refuses without the exact confirmation phrase', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const { POST } = await import('@/app/api/account/delete/route')
    const res = await POST(new Request('http://x/api/account/delete', { method: 'POST', body: JSON.stringify({ confirm: 'yes' }) }))
    expect(res.status).toBe(400)
    expect(adminDelete).not.toHaveBeenCalled()
  })

  it('delete removes the auth user (cascading all data) when the service key is configured', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    adminDelete.mockResolvedValue({ error: null })
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const { POST } = await import('@/app/api/account/delete/route')
    const res = await POST(new Request('http://x/api/account/delete', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }))
    expect(res.status).toBe(200)
    expect(adminDelete).toHaveBeenCalledWith('u1')
  })

  it('delete falls back to RLS-scoped row deletion without the service key', async () => {
    const sb = makeSupabase()
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    vi.mocked(createServerSupabaseClient).mockResolvedValue(sb as never)
    const { POST } = await import('@/app/api/account/delete/route')
    const res = await POST(new Request('http://x/api/account/delete', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }))
    expect(res.status).toBe(200)
    expect(sb.from).toHaveBeenCalledWith('sessions')
    expect(sb.from).toHaveBeenCalledWith('user_profiles')
    expect(adminDelete).not.toHaveBeenCalled()
  })
})
