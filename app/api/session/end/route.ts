import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { endSession } from '@/lib/session'
import { extractSessionProfile } from '@/lib/memory/sessionExtractor'
import { updateDharmaProfile } from '@/lib/memory/dharmaProfileExtractor'

// Extraction (transcript read + LLM call + profile writes) can take several
// seconds; give the function headroom so it isn't cut off mid-write.
export const maxDuration = 30

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
  } catch (err) {
    console.error('[session-end] extraction failed', err)
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
    const newlyEnded = await endSession(supabase, sessionId)
    // Await extraction so it actually runs: on serverless the function freezes
    // once the response is returned, which killed the old fire-and-forget path.
    // The response is consumed by navigator.sendBeacon, which ignores the body,
    // so awaiting is free user-facing. Only extract if THIS call ended the
    // session — a duplicate beacon (pagehide + visibilitychange) must not
    // double-extract.
    if (newlyEnded) {
      await runPostSessionExtraction(supabase, sessionId, user.id)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
