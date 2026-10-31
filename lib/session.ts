import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingFunction } from '@/lib/schema-compat'

export async function startSession(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ user_id: userId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

/**
 * Store one chat turn (seeker message + reply) and bump the turn counter in a single
 * transaction (save_exchange RPC), so a failure can never leave half a turn behind.
 * Only source references are stored, not the full verse text: the text lives once in
 * krishna_corpus, and copying it into every message bloated the DB.
 */
export async function saveExchange(
  supabase: SupabaseClient,
  sessionId: string,
  userMessage: string,
  assistantResponse: string,
  sources: object[],
  groundingPassed = true
): Promise<void> {
  const refs = (sources as Array<Record<string, unknown>>).map((s) => ({
    id: s.id, text_source: s.text_source, book_chapter: s.book_chapter, verse: s.verse,
  }))
  const { error } = await supabase.rpc('save_exchange', {
    p_session_id: sessionId,
    p_user_message: userMessage,
    p_assistant_message: assistantResponse,
    p_sources: refs,
    p_grounding_passed: groundingPassed,
  })
  if (!error) return
  if (!isMissingFunction(error)) throw new Error(error.message)

  // Migration 20261101 not applied yet: fall back to the old two-step write.
  const { error: msgError } = await supabase.from('messages').insert([
    { session_id: sessionId, role: 'user', content: userMessage },
    { session_id: sessionId, role: 'assistant', content: assistantResponse, retrieval_context: refs, grounding_passed: groundingPassed },
  ])
  if (msgError) throw new Error(msgError.message)
  const { error: rpcError } = await supabase.rpc('increment_session_turn', { p_session_id: sessionId })
  if (rpcError) throw new Error(rpcError.message)
}

/**
 * Ends a session by stamping `ended_at`, but only if it has not already ended.
 * Guarding on `ended_at is null` makes this idempotent: a duplicate end request
 * (e.g. pagehide + visibilitychange beacons both firing) affects zero rows the
 * second time. Returns whether this call is the one that newly ended the
 * session, so callers can run post-session work exactly once.
 */
export async function endSession(supabase: SupabaseClient, sessionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('ended_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

export type ResumedSession = {
  id: string
  turnCount: number
  history: { role: 'user' | 'assistant'; content: string }[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resume a session the caller owns and that hasn't ended, loading its recent history
 * from the DB. Returns null for a malformed id, someone else's session (RLS hides it),
 * or an ended one — the caller then starts a fresh session.
 *
 * History is read server-side on purpose: client-supplied history can be forged
 * (fake "assistant" turns are a prompt-injection vector) and is unbounded in size.
 */
export async function resumeSession(
  supabase: SupabaseClient,
  sessionId: unknown,
  historyLimit: number
): Promise<ResumedSession | null> {
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) return null
  const [{ data: session }, { data: rows }] = await Promise.all([
    supabase.from('sessions').select('id, turn_count, ended_at').eq('id', sessionId).maybeSingle(),
    supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(historyLimit),
  ])
  if (!session || session.ended_at) return null
  const history = ((rows ?? []) as { role: 'user' | 'assistant'; content: string }[]).reverse()
  return { id: session.id as string, turnCount: (session.turn_count as number) ?? 0, history }
}
