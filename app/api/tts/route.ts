import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit, rateLimitKey } from '@/lib/rateLimit'
import { synthesize } from '@/lib/tts'

const MAX_CHARS = 3000

// The client sends one request per sentence. A long "Deep" reply can run 20+ sentences,
// and the 3D avatar speaks every reply, so 20/min cut answers off mid-way. 60/min still
// caps abuse (~180k chars/min worst case per user) while never truncating a real answer.
const TTS_RATE_LIMIT = 60

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { allowed, retryAfterSec } = checkRateLimit(`tts:${rateLimitKey(req, user.id)}`, {
    limit: TTS_RATE_LIMIT,
    windowMs: 60_000,
  })
  if (!allowed) {
    return new Response('Too many requests', {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSec) },
    })
  }

  const { text } = await req.json().catch(() => ({}))
  if (!text || typeof text !== 'string') return new Response('Bad request', { status: 400 })

  try {
    const { audio, contentType } = await synthesize(text.slice(0, MAX_CHARS))
    return new Response(new Uint8Array(audio), {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[tts] synthesis failed:', err)
    return new Response('Speech synthesis failed', { status: 500 })
  }
}
