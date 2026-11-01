import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// The signed-in user's current plan, for the pricing page and the chat header.
// RLS: users can read only their own entitlement. An expired pass reads as free,
// the same rule consume_quota applies.
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ plan: 'free', validUntil: null, signedIn: false }, { headers: { 'Cache-Control': 'no-store' } })

  const { data } = await supabase.from('entitlements').select('plan, valid_until').eq('user_id', user.id).maybeSingle()
  const active = data && data.plan !== 'free' && (!data.valid_until || new Date(data.valid_until) > new Date())
  return NextResponse.json(
    { plan: active ? data.plan : 'free', validUntil: active ? data.valid_until ?? null : null, signedIn: true },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
