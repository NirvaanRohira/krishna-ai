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

  // Append previous_guidance_entry to user_profiles.previous_guidance array.
  // Read-modify-write is not atomic (a concurrent session could lose an entry);
  // a fully atomic jsonb append would need an RPC, which is out of scope here.
  // We at least surface failures and handle the missing-row case.
  if (extracted.previous_guidance_entry) {
    const { data: existing, error: selectError } = await supabase
      .from('user_profiles')
      .select('previous_guidance')
      .eq('user_id', userId)
      .single()

    if (selectError) {
      // The handle_new_user trigger (+ the INSERT RLS policy) should guarantee a
      // row exists; if the read fails we log and skip rather than clobber data.
      console.error('[dharma-profile] failed to read previous_guidance', selectError)
    } else {
      if (!existing) {
        console.error('[dharma-profile] no user_profiles row found for guidance append', { userId })
      }
      const current = (existing?.previous_guidance as object[]) ?? []
      const updated = [
        ...current,
        { date: new Date().toISOString().slice(0, 10), ...extracted.previous_guidance_entry },
      ]

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ previous_guidance: updated })
        .eq('user_id', userId)
      if (updateError) console.error('[dharma-profile] previous_guidance update failed', updateError)
    }
  }
}
