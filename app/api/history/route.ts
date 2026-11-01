import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// The signed-in user's past conversations, newest first. RLS limits both queries to the
// caller's own sessions and messages, so there is no way to list someone else's.
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, started_at, turn_count')
    .gt('turn_count', 0)
    .order('started_at', { ascending: false })
    .limit(50)
  if (error) {
    console.error('[history] list failed', error)
    return NextResponse.json({ error: 'Could not load your conversations.' }, { status: 500 })
  }
  const ids = (sessions ?? []).map((s) => s.id)
  const previews = new Map<string, string>()
  if (ids.length) {
    // The first thing the seeker said in each conversation, as its title.
    const { data: firsts } = await supabase
      .from('messages')
      .select('session_id, content, created_at')
      .in('session_id', ids)
      .eq('role', 'user')
      .order('created_at', { ascending: true })
      .limit(500)
    for (const m of firsts ?? []) if (!previews.has(m.session_id)) previews.set(m.session_id, m.content)
  }
  return NextResponse.json(
    {
      conversations: (sessions ?? []).map((s) => ({
        id: s.id,
        startedAt: s.started_at,
        turns: s.turn_count,
        preview: (previews.get(s.id) ?? '').slice(0, 140),
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
