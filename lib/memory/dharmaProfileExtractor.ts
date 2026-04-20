import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractedProfile } from '@/lib/memory/sessionExtractor'

export async function updateDharmaProfile(
  userId: string,
  extracted: ExtractedProfile,
  supabase: SupabaseClient
): Promise<void> {
  const ops: Promise<unknown>[] = []

  // Upsert spiritual profile fields
  if (extracted.primary_attachments || extracted.current_life_stage || extracted.recurring_themes) {
    const spiritualData: Record<string, unknown> = { user_id: userId }
    if (extracted.primary_attachments) spiritualData.primary_attachments = extracted.primary_attachments
    if (extracted.current_life_stage) spiritualData.current_life_stage = extracted.current_life_stage
    if (extracted.recurring_themes) spiritualData.recurring_themes = extracted.recurring_themes

    ops.push(
      supabase
        .from('user_spiritual_profile')
        .upsert(spiritualData, { onConflict: 'user_id' })
    )
  }

  // Upsert life_context into user_profiles
  if (extracted.life_context) {
    ops.push(
      supabase
        .from('user_profiles')
        .upsert({ user_id: userId, life_context: extracted.life_context }, { onConflict: 'user_id' })
    )
  }

  // Append previous_guidance_entry to user_profiles.previous_guidance array
  if (extracted.previous_guidance_entry) {
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('previous_guidance')
      .eq('user_id', userId)
      .single()

    const current = (existing?.previous_guidance as object[]) ?? []
    const updated = [
      ...current,
      { date: new Date().toISOString().slice(0, 10), ...extracted.previous_guidance_entry },
    ]

    ops.push(
      supabase
        .from('user_profiles')
        .update({ previous_guidance: updated })
        .eq('user_id', userId)
    )
  }

  await Promise.all(ops)
}
