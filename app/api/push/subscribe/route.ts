import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAllowedPushEndpoint } from '@/lib/push'

// Turn the morning-verse notification on (POST) or off (DELETE) for this browser.
// Opting in is the user's own browser permission plus this explicit call; turning it off
// is one tap on the verse page or the account page.

const KEY = /^[A-Za-z0-9_-]{8,200}$/

async function user() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function POST(req: Request) {
  const { supabase, user: u } = await user()
  if (!u) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (!isAllowedPushEndpoint(endpoint) || typeof p256dh !== 'string' || !KEY.test(p256dh) || typeof auth !== 'string' || !KEY.test(auth)) {
    return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 })
  }
  // Same browser re-subscribing: replace (RLS limits the delete to the caller's own rows).
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  const { error } = await supabase.from('push_subscriptions').insert({ user_id: u.id, endpoint, p256dh, auth })
  if (error) {
    console.error('[push] subscribe failed', error.code)
    return NextResponse.json({ error: 'Could not turn on notifications.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { supabase, user: u } = await user()
  if (!u) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const q = supabase.from('push_subscriptions').delete()
  const { error } = typeof body?.endpoint === 'string' ? await q.eq('endpoint', body.endpoint) : await q.eq('user_id', u.id)
  if (error) return NextResponse.json({ error: 'Could not turn off notifications.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
