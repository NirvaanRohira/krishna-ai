import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CODE_RE, VERIFIER_RE, tokenExpiry } from '@/lib/auth/app-handoff'
import { checkRateLimit, rateLimitKey } from '@/lib/rateLimit'

// Step 3 of signing in to the mobile app: the app swaps the one-time code and its PKCE
// verifier for its session. One attempt per code (a wrong verifier burns it).
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  const { allowed, retryAfterSec } = checkRateLimit(`app-token:${rateLimitKey(req)}`, { limit: 10, windowMs: 60_000 })
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(retryAfterSec) } })

  const body = await req.json().catch(() => null) as { code?: unknown; verifier?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code : ''
  const verifier = typeof body?.verifier === 'string' ? body.verifier : ''
  if (!CODE_RE.test(code) || !VERIFIER_RE.test(verifier)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
  })
  const { data, error } = await supabase.rpc('redeem_app_handoff', { p_code: code, p_verifier: verifier })
  const grant = data as { access_token?: string; refresh_token?: string } | null
  if (error || !grant?.access_token || !grant.refresh_token) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400, headers: NO_STORE })
  }
  return NextResponse.json(
    { access_token: grant.access_token, refresh_token: grant.refresh_token, expires_at: tokenExpiry(grant.access_token) },
    { headers: NO_STORE },
  )
}
