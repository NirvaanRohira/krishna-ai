import { SYSTEM_PROMPT_V2 } from '@/lib/prompts/system_v2'
import type { SupabaseClient } from '@supabase/supabase-js'

// In-process TTL cache for the injected system prompt, keyed by userId.
// loadAndInjectProfile runs on EVERY chat message, but profiles only change at
// session end, so ~30s of staleness is fine and saves a DB round-trip per
// message. NOTE: on multi-instance serverless this is a per-instance cache
// (each Lambda has its own Map) — that's acceptable here; it's a performance
// optimization, not a correctness guarantee.
const PROFILE_CACHE_TTL_MS = 30_000
const PROFILE_CACHE_MAX = 1000
const profileCache = new Map<string, { prompt: string; expires: number }>()

/** Test-only: clear the in-process profile cache. */
export function __clearProfileCache(): void {
  profileCache.clear()
}

export async function loadAndInjectProfile(
  userId: string,
  supabase: SupabaseClient
): Promise<string> {
  const now = Date.now()
  const cached = profileCache.get(userId)
  if (cached && cached.expires > now) return cached.prompt

  const [{ data: userProfile }, { data: spiritualProfile }] = await Promise.all([
    supabase.from('user_profiles').select('life_context, previous_guidance').eq('user_id', userId).single(),
    supabase.from('user_spiritual_profile').select('primary_attachments, current_life_stage, recurring_themes').eq('user_id', userId).single(),
  ])

  const prompt = buildPrompt(userProfile, spiritualProfile)

  // Evict expired entries and cap size to bound memory before inserting.
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    profileCache.forEach((entry, key) => {
      if (entry.expires <= now) profileCache.delete(key)
    })
    if (profileCache.size >= PROFILE_CACHE_MAX) {
      const oldest = profileCache.keys().next().value
      if (oldest !== undefined) profileCache.delete(oldest)
    }
  }
  profileCache.set(userId, { prompt, expires: now + PROFILE_CACHE_TTL_MS })

  return prompt
}

function buildPrompt(
  userProfile: { life_context?: string | null } | null,
  spiritualProfile: {
    primary_attachments?: string[] | null
    current_life_stage?: string | null
    recurring_themes?: string[] | null
  } | null
): string {
  const hasData =
    userProfile?.life_context ||
    spiritualProfile?.primary_attachments?.length ||
    spiritualProfile?.current_life_stage ||
    spiritualProfile?.recurring_themes?.length

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

  // Static system prompt FIRST, per-user block AFTER. LLM providers (DeepSeek, Gemini,
  // Groq, OpenAI) cache identical prompt *prefixes* and bill cached input at a fraction
  // of the normal rate. With the profile first, every user had a different prefix and
  // only that user's own repeat turns could hit the cache; now the ~1.5k-token system
  // prompt is a shared prefix across all users.
  return `${SYSTEM_PROMPT_V2}\n\n${lines.join('\n')}`
}
