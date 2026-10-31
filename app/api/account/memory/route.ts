import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// "What Kanha remembers about you": read it (GET) or wipe it (DELETE).
// The profile is inferred from conversations, so users must be able to see and correct it
// (DPDP right to correction/erasure). Conversations themselves are untouched.
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [profile, spiritual, plan] = await Promise.all([
    supabase.from('user_profiles').select('life_context, previous_guidance, marketing_opt_in').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_spiritual_profile').select('current_life_stage, recurring_themes, primary_attachments').eq('user_id', user.id).maybeSingle(),
    supabase.from('entitlements').select('plan, valid_until').eq('user_id', user.id).maybeSingle(),
  ])
  if (profile.error || spiritual.error) {
    console.error('[account/memory] read failed', profile.error ?? spiritual.error)
    return NextResponse.json({ error: 'Could not load your profile.' }, { status: 500 })
  }
  const guidance = (profile.data?.previous_guidance as { topic?: string; date?: string }[] | null) ?? []
  return NextResponse.json({
    life_context: profile.data?.life_context ?? null,
    life_stage: spiritual.data?.current_life_stage ?? null,
    themes: spiritual.data?.recurring_themes ?? [],
    attachments: spiritual.data?.primary_attachments ?? [],
    past_topics: guidance.map((g) => ({ topic: g.topic ?? '', date: g.date ?? '' })).slice(-10),
    marketing_opt_in: profile.data?.marketing_opt_in ?? false,
    // An expired pass reads as free (consume_quota applies the same rule).
    ...(() => {
      const active = plan.data && (!plan.data.valid_until || new Date(plan.data.valid_until) > new Date())
      return { plan: active ? plan.data!.plan : 'free', plan_until: active ? plan.data!.valid_until ?? null : null }
    })(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await supabase.rpc('clear_my_memory')
  if (error) {
    console.error('[account/memory] clear failed', error)
    return NextResponse.json({ error: 'Could not clear your profile. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
