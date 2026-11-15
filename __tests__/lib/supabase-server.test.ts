import { describe, it, expect, vi, beforeEach } from 'vitest'

// The mobile app authenticates with `Authorization: Bearer <access token>`; the website with
// cookies. Both must reach the database as the user (RLS), and nothing else may.

let authHeader: string | null = null
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map(authHeader ? [['authorization', authHeader]] : [])),
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}))
const getUserSpy = vi.fn(async (jwt?: string) => ({ data: { user: jwt ? { id: 'from-token' } : null }, error: null }))
const createClient = vi.fn((...args: [string, string, unknown]) => (args.length ? { auth: { getUser: getUserSpy } } : null))
vi.mock('@supabase/supabase-js', () => ({ createClient: (u: string, k: string, o: unknown) => createClient(u, k, o) }))
const createServerClient = vi.fn(() => ({ kind: 'cookie-client' }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => createServerClient() }))

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl'

beforeEach(() => { authHeader = null; vi.clearAllMocks() })

describe('createServerSupabaseClient', () => {
  it('uses the bearer token when the app sends one: every request carries it, and getUser verifies it', async () => {
    authHeader = `Bearer ${TOKEN}`
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const client = await createServerSupabaseClient()
    const opts = createClient.mock.calls[0][2] as { global: { headers: Record<string, string> }; auth: { persistSession: boolean } }
    expect(opts.global.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(opts.auth.persistSession).toBe(false)
    const { data } = await client.auth.getUser()
    expect(getUserSpy).toHaveBeenCalledWith(TOKEN)
    expect(data.user).toEqual({ id: 'from-token' })
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('falls back to the website cookie session otherwise, including for anything that is not a JWT', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    for (const h of [null, 'Bearer not-a-jwt', 'Basic dXNlcjpwYXNz', `Bearer ${TOKEN}\nX-Evil: 1`]) {
      authHeader = h
      expect(await createServerSupabaseClient()).toEqual({ kind: 'cookie-client' })
    }
    expect(createClient).not.toHaveBeenCalled()
  })
})
