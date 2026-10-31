import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractedProfile } from '@/lib/memory/sessionExtractor'

export async function updateDharmaProfile(
  userId: string,
  extracted: ExtractedProfile,
  supabase: SupabaseClient
): Promise<void> {
  // Upsert spiritual profile fields
  if (extracted.primary_attachments || extracted.current_life_stage || extracted.recurring_themes) {
    const spiritualData: Record<string, unknown> = { user_id: userId }
    if (extracted.primary_attachments) spiritualData.primary_attachments = extracted.primary_attachments
    if (extracted.current_life_stage) spiritualData.current_life_stage = extracted.current_life_stage
    if (extracted.recurring_themes) spiritualData.recurring_themes = extracted.recurring_themes

    const { error } = await supabase
      .from('user_spiritual_profile')
      .upsert(spiritualData, { onConflict: 'user_id' })
    if (error) console.error('[dharma-profile] spiritual upsert failed', error)
  }

  // Upsert life_context into user_profiles
  if (extracted.life_context) {
    const { error } = await supabase
      .from('user_profiles')
      .upsert({ user_id: userId, life_context: extracted.life_context }, { onConflict: 'user_id' })
    if (error) console.error('[dharma-profile] life_context upsert failed', error)
  }

  // Append atomically in the DB (append_previous_guidance RPC). The old read-modify-write
  // could drop an entry when two sessions ended at the same moment; the RPC's UPDATE takes
  // a row lock, and it keeps only the newest 20 entries so the profile can't grow forever.
  if (extracted.previous_guidance_entry) {
    const { error } = await supabase.rpc('append_previous_guidance', {
      p_entry: { date: new Date().toISOString().slice(0, 10), ...extracted.previous_guidance_entry },
    })
    if (error) console.error('[dharma-profile] previous_guidance append failed', error)
  }
}
