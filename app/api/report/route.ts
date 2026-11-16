import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit, rateLimitKey } from '@/lib/rateLimit'

// "Report this reply" (Google Play's AI-generated content policy; the website has it too).
// The report is filed as the signed-in user through RLS, only about their own conversation.
// The reported text is taken from the stored message when it matches what they saw.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REASONS = new Set(['harmful', 'offensive', 'wrong', 'other'])
const SOURCES = new Set(['web', 'android', 'ios'])
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { allowed, retryAfterSec } = checkRateLimit(`report:${rateLimitKey(req, user.id)}`, { limit: 5, windowMs: 60_000 })
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const sessionId = typeof body?.sessionId === 'string' && UUID.test(body.sessionId) ? body.sessionId : null
  const reason = typeof body?.reason === 'string' && REASONS.has(body.reason) ? body.reason : null
  const reply = typeof body?.reply === 'string' ? body.reply.trim() : ''
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : ''
  const source = typeof body?.source === 'string' && SOURCES.has(body.source) ? body.source : 'web'
  if (!reason || !reply || reply.length > 20_000) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  // Match the reply to the stored message (RLS: only the caller's own conversations).
  let messageId: string | null = null
  let excerpt = reply
  if (sessionId) {
    const { data: rows } = await supabase
      .from('messages')
      .select('id, content')
      .eq('session_id', sessionId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(100)
    const target = squash(reply)
    const hit = (rows ?? []).find((m) => squash(String(m.content)) === target)
    if (hit) { messageId = hit.id; excerpt = String(hit.content) }
  }

  const { error } = await supabase.from('reply_reports').insert({
    user_id: user.id,
    session_id: sessionId,
    message_id: messageId,
    reason,
    note: note || null,
    reply_excerpt: excerpt.slice(0, 4000),
    verified: messageId !== null,
    source,
  })
  if (error) {
    if (error.code === 'P0001') return NextResponse.json({ error: 'limit' }, { status: 429 })
    // A session that isn't theirs fails the RLS check: same answer as any bad request.
    if (error.code === '42501') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    console.error('[report] insert failed', error.code)
    return NextResponse.json({ error: 'Could not send your report. Please try again.' }, { status: 500 })
  }
  console.info('[report] filed', { reason, verified: messageId !== null, source })
  return NextResponse.json({ ok: true })
}
