import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// One past conversation. RLS returns nothing for a session that isn't the caller's, which
// we report as 404 (never "forbidden", so ids can't be probed).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await supabase.from('sessions').select('id, started_at').eq('id', id).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: messages, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('session_id', id)
    .order('created_at', { ascending: true })
    .limit(400)
  if (error) {
    console.error('[history] read failed', error)
    return NextResponse.json({ error: 'Could not load this conversation.' }, { status: 500 })
  }
  return NextResponse.json(
    { id: session.id, startedAt: session.started_at, messages: (messages ?? []).map((m) => ({ role: m.role, content: m.content })) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
