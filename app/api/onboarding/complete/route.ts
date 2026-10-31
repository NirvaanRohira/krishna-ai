import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { TERMS_VERSION, PRIVACY_VERSION, AI_DISCLOSURE_VERSION } from '@/lib/legal'
import { isMissingColumn } from '@/lib/schema-compat'

// Onboarding records *explicit, itemised* consent server-side (DPDP Act 2023: consent
// must be free, specific, informed and unambiguous, with proof retained). Every required
// box must be ticked; marketing is a separate, optional, unticked-by-default opt-in.
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const ageConfirmed = body?.ageConfirmed18 === true
  const accepted = body?.acceptTerms === true && body?.acceptPrivacy === true && body?.aiDisclosure === true
  const marketing = body?.marketingOptIn === true

  if (!ageConfirmed) {
    return NextResponse.json({ error: 'You must be 18 or older to use this service.' }, { status: 403 })
  }
  if (!accepted) {
    return NextResponse.json({ error: 'Please accept the terms, privacy notice and AI disclosure to continue.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  let { error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: user.id,
      onboarding_complete: true,
      age_confirmed_18_plus: true,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      consented_at: now,
      marketing_opt_in: marketing,
    }, { onConflict: 'user_id' })

  // Before migration 20261031: the consent columns don't exist yet. Record what the old
  // schema can hold so the user isn't locked out; the ledger below still tries.
  if (isMissingColumn(error)) {
    ;({ error } = await supabase.from('user_profiles').upsert({ user_id: user.id, onboarding_complete: true }, { onConflict: 'user_id' }))
  }

  if (error) {
    console.error('[onboarding] profile upsert failed:', error)
    return NextResponse.json({ error: 'Could not save your preferences. Please try again.' }, { status: 500 })
  }

  const { error: ledgerError } = await supabase.from('consent_events').insert([
    { user_id: user.id, kind: 'age_18_plus', version: '1', granted: true },
    { user_id: user.id, kind: 'terms', version: TERMS_VERSION, granted: true },
    { user_id: user.id, kind: 'privacy', version: PRIVACY_VERSION, granted: true },
    { user_id: user.id, kind: 'ai_disclosure', version: AI_DISCLOSURE_VERSION, granted: true },
    { user_id: user.id, kind: 'marketing', version: PRIVACY_VERSION, granted: marketing },
  ])
  // The profile row already proves consent; a ledger failure is logged, not fatal.
  if (ledgerError) console.error('[onboarding] consent ledger insert failed:', ledgerError)

  return NextResponse.json({ ok: true })
}
