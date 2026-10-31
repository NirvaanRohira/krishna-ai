import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rateLimit'

// Right to access (DPDP Act s.11): a user can download everything we hold about them.
// Uses the user-scoped client, so RLS guarantees it can only ever return their own rows.
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { allowed, retryAfterSec } = checkRateLimit(`export:${user.id}`, { limit: 5, windowMs: 60 * 60_000 })
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } })
  }

  const [profile, spiritual, sessions, consents] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_spiritual_profile').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('sessions').select('id, started_at, ended_at, turn_count, messages(role, content, created_at)')
      .eq('user_id', user.id).order('started_at', { ascending: true }),
    supabase.from('consent_events').select('kind, version, granted, created_at').eq('user_id', user.id),
  ])

  const failed = [profile, spiritual, sessions, consents].find((r) => r.error)
  if (failed) {
    console.error('[account/export] query failed:', failed.error)
    return NextResponse.json({ error: 'Export failed. Please try again.' }, { status: 500 })
  }

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at },
    profile: profile.data,
    spiritual_profile: spiritual.data,
    sessions: sessions.data,
    consent_history: consents.data,
  }
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="my-krishna-ai-data.json"',
      'Cache-Control': 'no-store',
    },
  })
}
