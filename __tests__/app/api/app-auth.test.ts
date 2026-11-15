import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

// Mobile-app sign-in through the website (docs/MOBILE_PLAN.md, phase 1), and bearer tokens.

const cookieJar = new Map<string, string>()
let authHeader: string | null = null
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    set: vi.fn(),
  })),
  headers: vi.fn(async () => new Map(authHeader ? [['authorization', authHeader]] : [])),
}))

const supa = {
  getUser: vi.fn(),
  getSession: vi.fn(),
  profile: vi.fn(),
  insert: vi.fn(),
}
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: supa.getUser, getSession: supa.getSession },
    from: (table: string) => table === 'user_profiles'
      ? { select: () => ({ eq: () => ({ single: supa.profile }) }) }
      : { insert: supa.insert },
  })),
}))

const anon = { rpc: vi.fn(), refreshSession: vi.fn() }
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: anon.rpc, auth: { refreshSession: anon.refreshSession, getUser: vi.fn() } })),
}))

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const CODE = 'a'.repeat(43)
const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://kanhacall.vercel.app${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': `1.2.3.${Math.floor(Math.random() * 250)}`, ...headers }, body: JSON.stringify(body) })

beforeEach(async () => {
  cookieJar.clear()
  authHeader = null
  vi.clearAllMocks()
  const { __resetRateLimitStore } = await import('@/lib/rateLimit')
  __resetRateLimitStore()
})

describe('GET /auth/app-start', () => {
  it('remembers a valid challenge in a short-lived httpOnly cookie and goes to the handoff', async () => {
    const { GET } = await import('@/app/auth/app-start/route')
    const res = await GET(new Request(`https://kanhacall.vercel.app/auth/app-start?challenge=${CHALLENGE}`))
    expect(res.headers.get('location')).toBe('https://kanhacall.vercel.app/auth/app-handoff')
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/kanha_app=E9Melhoa/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toMatch(/Max-Age=900/)
  })

  it('ignores a malformed challenge', async () => {
    const { GET } = await import('@/app/auth/app-start/route')
    const res = await GET(new Request('https://kanhacall.vercel.app/auth/app-start?challenge=<script>'))
    expect(res.headers.get('location')).toBe('https://kanhacall.vercel.app/')
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

describe('GET /auth/app-handoff', () => {
  const call = async () => (await import('@/app/auth/app-handoff/route')).GET(new Request('https://kanhacall.vercel.app/auth/app-handoff'))

  it('without an app sign-in in progress, it is just the website', async () => {
    expect((await call()).headers.get('location')).toBe('https://kanhacall.vercel.app/chat')
  })

  it('sends people to sign in, then through onboarding (terms, 18+, AI consent) first', async () => {
    cookieJar.set('kanha_app', CHALLENGE)
    supa.getUser.mockResolvedValue({ data: { user: null } })
    expect((await call()).headers.get('location')).toBe('https://kanhacall.vercel.app/login')
    supa.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    supa.profile.mockResolvedValue({ data: { onboarding_complete: false, terms_version: null } })
    expect((await call()).headers.get('location')).toBe('https://kanhacall.vercel.app/onboarding')
  })

  it('stores the session under the hash of a one-time code, opens only the Kanha app, and clears the browser session', async () => {
    cookieJar.set('kanha_app', CHALLENGE)
    cookieJar.set('sb-abc-auth-token', 'x')
    cookieJar.set('sb-abc-auth-token.1', 'y')
    const { TERMS_VERSION } = await import('@/lib/legal')
    supa.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    supa.profile.mockResolvedValue({ data: { onboarding_complete: true, terms_version: TERMS_VERSION } })
    supa.getSession.mockResolvedValue({ data: { session: { access_token: 'acc', refresh_token: 'ref' } } })
    supa.insert.mockResolvedValue({ error: null })

    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    const html = await res.text()
    const code = /intent:\/\/auth\?code=([A-Za-z0-9_-]{43})#Intent;scheme=kanha;package=app\.kanha\.android;end/.exec(html)?.[1]
    expect(code).toBeTruthy()
    const row = supa.insert.mock.calls[0][0]
    expect(row).toMatchObject({ user_id: 'u1', challenge: CHALLENGE, access_token: 'acc', refresh_token: 'ref' })
    expect(row.code_hash).toBe(createHash('sha256').update(code!).digest('hex'))
    expect(JSON.stringify(row)).not.toContain(code!)
    const cleared = res.headers.getSetCookie().join('\n')
    expect(cleared).toMatch(/kanha_app=;/)
    expect(cleared).toMatch(/sb-abc-auth-token=;/)
    expect(cleared).toMatch(/sb-abc-auth-token\.1=;/)
    expect(html).toMatch(/not God, not Krishna/)
  })

  it('a database failure shows a plain message, never internal detail', async () => {
    cookieJar.set('kanha_app', CHALLENGE)
    const { TERMS_VERSION } = await import('@/lib/legal')
    supa.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    supa.profile.mockResolvedValue({ data: { onboarding_complete: true, terms_version: TERMS_VERSION } })
    supa.getSession.mockResolvedValue({ data: { session: { access_token: 'acc', refresh_token: 'ref' } } })
    supa.insert.mockResolvedValue({ error: { message: 'relation "app_handoffs" does not exist' } })
    const res = await call()
    expect(res.status).toBe(500)
    const html = await res.text()
    expect(html).not.toMatch(/relation|app_handoffs|intent:/)
  })
})

describe('POST /api/auth/app-token', () => {
  const call = async (body: unknown) => (await import('@/app/api/auth/app-token/route')).POST(post('/api/auth/app-token', body))

  it('rejects malformed codes and verifiers before touching the database', async () => {
    expect((await call({ code: 'short', verifier: VERIFIER })).status).toBe(400)
    expect((await call({ code: CODE, verifier: 'has spaces in it '.repeat(4) })).status).toBe(400)
    expect(anon.rpc).not.toHaveBeenCalled()
  })

  it('returns the session for a valid code and verifier, with its expiry', async () => {
    anon.rpc.mockResolvedValue({ data: { access_token: jwt(1_900_000_000), refresh_token: 'ref', user_id: 'u1' }, error: null })
    const res = await call({ code: CODE, verifier: VERIFIER })
    expect(anon.rpc).toHaveBeenCalledWith('redeem_app_handoff', { p_code: CODE, p_verifier: VERIFIER })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ access_token: jwt(1_900_000_000), refresh_token: 'ref', expires_at: 1_900_000_000 })
  })

  it('a wrong, used or expired code is one generic answer', async () => {
    anon.rpc.mockResolvedValue({ data: null, error: null })
    const res = await call({ code: CODE, verifier: VERIFIER })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('is rate limited per client', async () => {
    anon.rpc.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('@/app/api/auth/app-token/route')
    const req = () => post('/api/auth/app-token', { code: CODE, verifier: VERIFIER }, { 'x-real-ip': '9.9.9.9' })
    for (let i = 0; i < 10; i++) await POST(req())
    expect((await POST(req())).status).toBe(429)
  })
})

describe('POST /api/auth/app-refresh', () => {
  const call = async (body: unknown) => (await import('@/app/api/auth/app-refresh/route')).POST(post('/api/auth/app-refresh', body))

  it('swaps a refresh token for a new session', async () => {
    anon.refreshSession.mockResolvedValue({ data: { session: { access_token: 'acc2', refresh_token: 'ref2', expires_at: 1_900_000_100 } }, error: null })
    const res = await call({ refresh_token: 'abcdefgh1234' })
    expect(await res.json()).toEqual({ access_token: 'acc2', refresh_token: 'ref2', expires_at: 1_900_000_100 })
  })

  it('a revoked or bad refresh token means sign in again (401), malformed is 400', async () => {
    anon.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid Refresh Token: Already Used' } })
    const res = await call({ refresh_token: 'abcdefgh1234' })
    expect(res.status).toBe(401)
    expect(JSON.stringify(await res.json())).not.toMatch(/Already Used/)
    expect((await call({ refresh_token: 'x' })).status).toBe(400)
  })
})

describe('POST /api/auth/app-signout', () => {
  it('ends the session at Supabase when a token is sent, and always answers 204', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    authHeader = 'Bearer aaa.bbb.ccc'
    const { POST } = await import('@/app/api/auth/app-signout/route')
    expect((await POST()).status).toBe(204)
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/auth\/v1\/logout\?scope=local$/)
    authHeader = null
    fetchSpy.mockClear()
    expect((await POST()).status).toBe(204)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
