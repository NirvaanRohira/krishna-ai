import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

// Signing out of the mobile app: ends this session at Supabase (its refresh token stops
// working), then the app deletes its stored tokens. Always succeeds from the app's side.
export async function POST() {
  const auth = (await headers()).get('authorization') ?? ''
  if (/^Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth)) {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: auth },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {})
  }
  return new NextResponse(null, { status: 204 })
}
