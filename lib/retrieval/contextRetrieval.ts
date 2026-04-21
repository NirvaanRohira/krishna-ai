import { embedText } from '@/lib/gemini'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getContextVector(
  userId: string,
  options?: { supabaseClient?: SupabaseClient }
): Promise<number[] | null> {
  const supabase = options?.supabaseClient ?? await createServerSupabaseClient()

  const { data } = await supabase
    .from('user_profiles')
    .select('last_session_summary')
    .eq('user_id', userId)
    .single()

  const summary: string | null | undefined = data?.last_session_summary
  if (!summary) return null

  return embedText(summary)
}
