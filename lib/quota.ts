import type { SupabaseClient } from '@supabase/supabase-js'

export type QuotaKind = 'message' | 'voice_chars'
export type QuotaResult = {
  allowed: boolean
  reason: 'ok' | 'rate' | 'daily' | 'unauthenticated' | 'error'
  plan?: string
  limit?: number
  used?: number
}

/**
 * Durable, cross-instance quota check (consume_quota RPC — see the 20261101 migration).
 * Fails OPEN on a DB/RPC error: availability beats metering, the in-memory limiter still
 * caps bursts, and an outage that breaks this also breaks chat anyway.
 */
export async function consumeQuota(supabase: SupabaseClient, kind: QuotaKind, amount = 1): Promise<QuotaResult> {
  try {
    const { data, error } = await supabase.rpc('consume_quota', { p_kind: kind, p_amount: amount })
    if (error || !data) throw error ?? new Error('empty quota response')
    return data as QuotaResult
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('[quota] check failed — allowing request', err)
    return { allowed: true, reason: 'error' }
  }
}

const UPGRADE = { free: 'Plus', plus: 'Premium' } as Record<string, string | undefined>

/** Friendly, honest wording for a blocked request (shown in chat). */
export function quotaMessage(r: QuotaResult, kind: QuotaKind): string {
  if (r.reason === 'rate') return 'You are sending messages quickly. Take a breath, and try again in a minute.'
  const next = r.plan ? UPGRADE[r.plan] : undefined
  if (kind === 'voice_chars') {
    return `Today's spoken replies are used up${next ? ` on the ${r.plan} plan` : ''}. Replies will still appear as text, and voice resets at midnight IST.`
  }
  return `You've reached today's ${r.limit ?? ''} messages${r.plan ? ` on the ${r.plan} plan` : ''}. Your limit resets at midnight IST.${next ? ` ${next} gives you more each day.` : ''}`.replace('  ', ' ')
}

/** Rough token estimate for spend metering (≈3.5 chars/token across English + Indic). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

export async function recordLlmUsage(supabase: SupabaseClient, inTokens: number, outTokens: number): Promise<void> {
  try {
    const { error } = await supabase.rpc('record_llm_usage', { p_in_tokens: inTokens, p_out_tokens: outTokens })
    if (error) throw error
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('[quota] usage record failed', err)
  }
}
