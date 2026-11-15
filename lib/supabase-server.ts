import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'

// Every DB call gets a hard timeout so a stuck connection can't hang a request.
const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) })

/** A Supabase access token (a JWT): three base64url parts. Anything else is ignored. */
const BEARER = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/

/**
 * The user-scoped client for a request. The website signs in with cookies; the mobile app
 * sends `Authorization: Bearer <access token>` (docs/MOBILE_PLAN.md). Either way the database
 * sees the user's own JWT, so RLS decides what they can read and write, exactly as before.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const token = await bearerToken()
  if (token) return bearerClient(token)

  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timedFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Setting cookies throws outside a mutable context (e.g. in work scheduled with
          // after(), once the response is sent). The proxy refreshes sessions on the next
          // request, so a skipped write here is safe.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* response already sent */ }
        },
      },
    }
  ) as unknown as SupabaseClient
}

async function bearerToken(): Promise<string | null> {
  try {
    const value = (await headers()).get('authorization') ?? ''
    if (value.length > 8192) return null
    return BEARER.exec(value)?.[1] ?? null
  } catch {
    return null // no request in scope (e.g. a background job): use cookies
  }
}

/**
 * A client that acts as the bearer of `token`. PostgREST and RPC calls carry the token (so RLS
 * applies); auth.getUser() verifies it with Supabase Auth, as the cookie client does.
 */
export function bearerClient(token: string): SupabaseClient {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { fetch: timedFetch, headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const getUser = client.auth.getUser.bind(client.auth)
  client.auth.getUser = ((jwt?: string) => getUser(jwt ?? token)) as typeof client.auth.getUser
  return client
}
