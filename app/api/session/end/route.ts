import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { endSession } from '@/lib/session'
import { extractSessionProfile } from '@/lib/memory/sessionExtractor'
import { updateDharmaProfile } from '@/lib/memory/dharmaProfileExtractor'

async function runPostSessionExtraction(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sessionId: string,
  userId: string
) {
  try {
    const { data: messages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (!messages || messages.length === 0) return

    const transcript = (messages as { role: string; content: string }[])
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')

    const extracted = await extractSessionProfile(transcript)
    await updateDharmaProfile(userId, extracted, supabase)
  } catch {
    // background — never throw
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { sessionId } = body

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await endSession(supabase, sessionId)
    // Fire extraction without awaiting — returns 200 immediately
    void runPostSessionExtraction(supabase, sessionId, user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
