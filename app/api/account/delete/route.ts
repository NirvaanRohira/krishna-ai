import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Right to erasure (DPDP Act s.12). Requires an explicit confirmation string so a stray or
// cross-site request can't wipe an account.
//
// With SUPABASE_SERVICE_ROLE_KEY set, deletes the auth user itself — every table cascades
// from auth.users, so this removes ALL personal data in one transaction. That key is used
// ONLY here (least privilege) and must never be exposed to the browser.
// Without it, deletes the user's rows through RLS and signs them out; the bare auth record
// (email only) must then be removed by an admin.
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (body?.confirm !== 'DELETE MY ACCOUNT') {
    return NextResponse.json({ error: 'Confirmation text does not match.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (admin) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) {
      console.error('[account/delete] admin delete failed:', error)
      return NextResponse.json({ error: 'Deletion failed. Please contact support.' }, { status: 500 })
    }
    await supabase.auth.signOut().catch(() => {})
    return NextResponse.json({ ok: true, deleted: 'account' })
  }

  // RLS-scoped fallback: sessions cascade to messages.
  const results = await Promise.all([
    supabase.from('sessions').delete().eq('user_id', user.id),
    supabase.from('user_spiritual_profile').delete().eq('user_id', user.id),
    supabase.from('user_profiles').delete().eq('user_id', user.id),
  ])
  const failed = results.find((r) => r.error)
  if (failed) {
    console.error('[account/delete] row delete failed:', failed.error)
    return NextResponse.json({ error: 'Deletion failed. Please contact support.' }, { status: 500 })
  }
  console.warn('[account/delete] data deleted; auth record pending admin removal', { userId: user.id })
  await supabase.auth.signOut().catch(() => {})
  return NextResponse.json({ ok: true, deleted: 'data' })
}
