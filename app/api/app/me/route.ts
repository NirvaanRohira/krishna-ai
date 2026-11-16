import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { TERMS_VERSION } from '@/lib/legal'

// Who is signed in to the mobile app, for its "You" screen and to decide whether it must show
// the consent screen first. RLS: the caller reads only their own rows.
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

  const [profile, plan] = await Promise.all([
    supabase.from('user_profiles').select('onboarding_complete, terms_version, marketing_opt_in').eq('user_id', user.id).maybeSingle(),
    supabase.from('entitlements').select('plan, valid_until').eq('user_id', user.id).maybeSingle(),
  ])
  if (profile.error) {
    console.error('[app/me] profile read failed', profile.error.code)
    return NextResponse.json({ error: 'Could not load your account.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
  // An expired pass reads as free (consume_quota applies the same rule).
  const p = plan.data
  const active = !!p && p.plan !== 'free' && (!p.valid_until || new Date(p.valid_until) > new Date())
  const provider = typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : null
  return NextResponse.json(
    {
      email: user.email ?? null,
      provider: provider === 'google' || provider === 'email' ? provider : null,
      // Consent must be for the current terms; a change of terms asks again, as on the website.
      onboarded: profile.data?.onboarding_complete === true && profile.data?.terms_version === TERMS_VERSION,
      marketing_opt_in: profile.data?.marketing_opt_in === true,
      plan: active ? p!.plan : 'free',
      plan_until: active ? p!.valid_until ?? null : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
