import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { transcribeAudioGroq, transcribeAudio } from '@/lib/transcribe'
import { checkRateLimit, rateLimitKey } from '@/lib/rateLimit'

// ~2 minutes of compressed speech. Audio is never stored; it is forwarded to STT only.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const ALLOWED_AUDIO = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/m4a', 'audio/x-m4a'])

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { allowed, retryAfterSec } = checkRateLimit(`stt:${rateLimitKey(req, user.id)}`, { limit: 20, windowMs: 60_000 })
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } })
  }

  // Reject oversized bodies before buffering them.
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_AUDIO_BYTES + 64_000) {
    return NextResponse.json({ error: 'Audio too large' }, { status: 413 })
  }

  const formData = await req.formData().catch(() => null)
  const entry = formData?.get('audio')
  // Structural check (not instanceof): Blob classes differ between runtimes.
  if (!entry || typeof entry === 'string' || typeof (entry as Blob).arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
  }
  const audio = entry as Blob
  if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio too large' }, { status: 413 })
  const mime = (audio.type || '').split(';')[0].trim().toLowerCase()
  if (!ALLOWED_AUDIO.has(mime)) return NextResponse.json({ error: 'Unsupported audio format' }, { status: 415 })

  try {
    const text = await transcribeAudioGroq(audio)
    return NextResponse.json({ text })
  } catch (groqErr) {
    console.warn('[transcribe] Groq STT failed, falling back to Gemini:', groqErr instanceof Error ? groqErr.message : groqErr)
    try {
      const text = await transcribeAudio(audio)
      return NextResponse.json({ text })
    } catch (err) {
      console.error('[transcribe] Gemini fallback error:', err)
      return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
    }
  }
}
