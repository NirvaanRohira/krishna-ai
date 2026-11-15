import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { tokenExpiry } from '@/lib/auth/app-handoff'
import { checkRateLimit, rateLimitKey } from '@/lib/rateLimit'

// Keeps the mobile app signed in: swaps a refresh token for a new session (Supabase rotates
// the refresh token each time). The app talks only to this server, never to Supabase directly.
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  const { allowed, retryAfterSec } = checkRateLimit(`app-refresh:${rateLimitKey(req)}`, { limit: 20, windowMs: 60_000 })
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(retryAfterSec) } })

  const body = await req.json().catch(() => null) as { refresh_token?: unknown } | null
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token : ''
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(refreshToken)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
  })
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
  const s = data.session
  if (error || !s?.access_token || !s.refresh_token) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 401, headers: NO_STORE })
  }
  return NextResponse.json(
    { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? tokenExpiry(s.access_token) },
    { headers: NO_STORE },
  )
}
