import type { SupabaseClient } from '@supabase/supabase-js'

export async function startSession(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ user_id: userId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function saveExchange(
  supabase: SupabaseClient,
  sessionId: string,
  userMessage: string,
  assistantResponse: string,
  sources: object[],
  groundingPassed = true
): Promise<void> {
  const { error: msgError } = await supabase.from('messages').insert([
    { session_id: sessionId, role: 'user', content: userMessage },
    {
      session_id: sessionId,
      role: 'assistant',
      content: assistantResponse,
      retrieval_context: sources,
      grounding_passed: groundingPassed,
    },
  ])
  if (msgError) throw new Error(msgError.message)

  const { error: rpcError } = await supabase.rpc('increment_session_turn', {
    p_session_id: sessionId,
  })
  if (rpcError) throw new Error(rpcError.message)
}

export async function endSession(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw new Error(error.message)
}
