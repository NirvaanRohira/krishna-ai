import { NextResponse } from 'next/server'

// What the mobile apps need to know at start-up, served from the website's own settings so the
// apps never hard-code the backend (moving to a new Supabase project needs no app release).
//
// The apps sign in directly with Supabase Auth, as the website's browser code does: the anon key
// is public by design (it is in the website's JavaScript too, and RLS protects the data). Going
// direct keeps Supabase's per-IP sign-in limits per phone, instead of every phone sharing the
// server's IP. `min_version_code` lets us ask very old app builds to update.
export const dynamic = 'force-dynamic'

export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(url.replace(/\/$/, '')) || !key) {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const min = Number.parseInt(process.env.APP_MIN_VERSION_CODE ?? '', 10)
  return NextResponse.json(
    { supabase_url: url.replace(/\/$/, ''), supabase_anon_key: key, min_version_code: Number.isFinite(min) && min > 0 ? min : 1 },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}
