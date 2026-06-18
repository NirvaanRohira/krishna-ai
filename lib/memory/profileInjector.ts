import { SYSTEM_PROMPT_V2 } from '@/lib/prompts/system_v2'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function loadAndInjectProfile(
  userId: string,
  supabase: SupabaseClient
): Promise<string> {
  const [{ data: userProfile }, { data: spiritualProfile }] = await Promise.all([
    supabase.from('user_profiles').select('life_context, previous_guidance').eq('user_id', userId).single(),
    supabase.from('user_spiritual_profile').select('primary_attachments, current_life_stage, recurring_themes').eq('user_id', userId).single(),
  ])

  const hasData = userProfile?.life_context || spiritualProfile?.primary_attachments?.length

  if (!hasData) return SYSTEM_PROMPT_V2

  const lines: string[] = ['## About this person (from prior sessions)']

  if (userProfile?.life_context) {
    lines.push(`Life context: ${userProfile.life_context}`)
  }

  if (spiritualProfile?.current_life_stage) {
    lines.push(`Life stage: ${spiritualProfile.current_life_stage}`)
  }

  if (spiritualProfile?.primary_attachments?.length) {
    lines.push(`Primary attachments: ${(spiritualProfile.primary_attachments as string[]).join(', ')}`)
  }

  if (spiritualProfile?.recurring_themes?.length) {
    lines.push(`Recurring themes: ${(spiritualProfile.recurring_themes as string[]).join(', ')}`)
  }

  return `${lines.join('\n')}\n\n${SYSTEM_PROMPT_V2}`
}
