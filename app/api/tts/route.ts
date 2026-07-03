import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit, rateLimitKey } from '@/lib/rateLimit'

const polly = new PollyClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const MAX_CHARS = 3000

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { allowed, retryAfterSec } = checkRateLimit(rateLimitKey(req, user.id), {
    limit: 20,
    windowMs: 60_000,
  })
  if (!allowed) {
    return new Response('Too many requests', {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSec) },
    })
  }

  const { text } = await req.json()
  if (!text || typeof text !== 'string') return new Response('Bad request', { status: 400 })

  const trimmed = text.slice(0, MAX_CHARS)

  const command = new SynthesizeSpeechCommand({
    Text: trimmed,
    VoiceId: 'Matthew',
    Engine: 'neural',
    OutputFormat: 'mp3',
  })

  try {
    const result = await polly.send(command)
    if (!result.AudioStream) return new Response('No audio', { status: 500 })

    const chunks: Uint8Array[] = []
    for await (const chunk of result.AudioStream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    const audio = Buffer.concat(chunks)

    return new Response(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[tts] synthesis failed:', err)
    return new Response('Speech synthesis failed', { status: 500 })
  }
}
