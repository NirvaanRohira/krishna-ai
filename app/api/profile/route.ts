import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [{ data: userProfile }, { data: spiritualProfile }] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('user_id', user.id).single(),
    supabase.from('user_spiritual_profile').select('*').eq('user_id', user.id).single(),
  ])

  return NextResponse.json({ user_profile: userProfile, spiritual_profile: spiritualProfile })
}
