import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { PRIVACY_VERSION } from '@/lib/legal'

// Change optional consents (today: marketing). Withdrawing is one tap — as easy as giving
// it — and every change is appended to the consent ledger as proof (DPDP Act s.6(4)).
// Withdrawing the core consent to process conversations = deleting the account (/account).
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (typeof body?.marketing !== 'boolean') {
    return NextResponse.json({ error: 'marketing must be true or false' }, { status: 400 })
  }

  const { error } = await supabase.from('user_profiles').update({ marketing_opt_in: body.marketing }).eq('user_id', user.id)
  if (error) {
    console.error('[account/consent] update failed', error)
    return NextResponse.json({ error: 'Could not save your choice. Please try again.' }, { status: 500 })
  }
  const { error: ledgerError } = await supabase.from('consent_events')
    .insert({ user_id: user.id, kind: 'marketing', version: PRIVACY_VERSION, granted: body.marketing })
  if (ledgerError) console.error('[account/consent] ledger insert failed', ledgerError)
  return NextResponse.json({ ok: true, marketing: body.marketing })
}
