import { describe, it, expect, beforeAll, vi } from 'vitest'

// Stub env vars before module import — createBrowserSupabaseClient reads these at call time
beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test-project.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key-placeholder')
})

describe('createBrowserSupabaseClient', () => {
  it('creates a client without throwing', async () => {
    // This test fails (RED) because lib/supabase.ts does not exist yet
    const { createBrowserSupabaseClient } = await import('@/lib/supabase')
    expect(() => createBrowserSupabaseClient()).not.toThrow()
  })

  it('returns an object with the from() query builder method', async () => {
    const { createBrowserSupabaseClient } = await import('@/lib/supabase')
    const client = createBrowserSupabaseClient()
    expect(client).toHaveProperty('from')
    expect(typeof client.from).toBe('function')
  })

  it('returns an object with the auth interface', async () => {
    const { createBrowserSupabaseClient } = await import('@/lib/supabase')
    const client = createBrowserSupabaseClient()
    expect(client).toHaveProperty('auth')
    expect(client.auth).toHaveProperty('signInWithOtp')
  })
})
