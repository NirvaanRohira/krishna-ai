import type { SupabaseClient } from '@supabase/supabase-js'
import { endSession } from '@/lib/session'
import { extractSessionProfile } from '@/lib/memory/sessionExtractor'
import { updateDharmaProfile } from '@/lib/memory/dharmaProfileExtractor'

/**
 * Read a finished session's full transcript FROM THE DATABASE and fold what it reveals
 * into the user's profile (life context, life stage, attachments, recurring themes,
 * a log of past guidance). The profile is then injected into every future prompt.
 * The browser never supplies the transcript — the server stored each turn as it happened.
 */
export async function extractAndStoreProfile(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<void> {
  try {
    const { data: messages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (!messages || messages.length === 0) return

    const transcript = (messages as { role: string; content: string }[])
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')

    const extracted = await extractSessionProfile(transcript)
    await updateDharmaProfile(userId, extracted, supabase)
  } catch (err) {
    console.error('[post-session] extraction failed', err)
  }
}

/**
 * Safety net for the end-of-session beacon. Mobile browsers often kill a tab before it
 * can report that the conversation ended, which used to mean that conversation never
 * reached the profile. When a user starts a new session, close any of their sessions
 * still left open and extract them. endSession() is idempotent, so a late beacon and
 * this sweep can never double-process the same session.
 */
export async function closeStaleSessions(
  supabase: SupabaseClient,
  userId: string,
  exceptSessionId: string,
  limit = 3
): Promise<number> {
  try {
    const { data: open } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .is('ended_at', null)
      .neq('id', exceptSessionId)
      .order('started_at', { ascending: false })
      .limit(limit)

    let processed = 0
    for (const row of (open ?? []) as { id: string }[]) {
      if (await endSession(supabase, row.id)) {
        await extractAndStoreProfile(supabase, row.id, userId)
        processed++
      }
    }
    return processed
  } catch (err) {
    console.error('[post-session] stale sweep failed', err)
    return 0
  }
}
