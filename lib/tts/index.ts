// Text-to-speech provider abstraction.
//
// Select with TTS_PROVIDER = 'polly' (default) | 'google' | 'sarvam'.
// TTS_FALLBACK (optional) names a second provider tried if the primary throws.
//
// Why more than Polly: Polly has no Indian-English or Hindi *male* neural voice
// (Matthew is US-English). For the Indian market Krishna should sound Indian:
//   - google: Cloud TTS en-IN / hi-IN voices (Chirp 3 HD, Neural2, WaveNet).
//             Billed to GCP — runs on GCP credits.
//   - sarvam: Sarvam Bulbul — Indian-built, 11 Indian languages, many male voices.
// All three return audio the browser can play directly; the avatar's lip-sync is
// driven from the audio itself, so no provider-specific viseme data is needed.

import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'
import { withRetry, HttpError, fetchWithTimeout } from '@/lib/retry'

export type TTSResult = { audio: Buffer; contentType: string }
export type TTSProviderName = 'polly' | 'google' | 'sarvam'

export type TTSOptions = {
  /** BCP-47 locale, e.g. 'en-IN', 'hi-IN', 'ta-IN'. */
  locale?: string
  /** Voice tier. Only Google has two tiers; other providers ignore it. */
  quality?: 'standard' | 'hd'
}
type Synth = (text: string, opts: TTSOptions) => Promise<TTSResult>

// ── AWS Polly ───────────────────────────────────────────────────────────────
let _polly: PollyClient | undefined
function polly(): PollyClient {
  if (!_polly) {
    _polly = new PollyClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  }
  return _polly
}

const synthPolly: Synth = async (text) => {
  // Polly has no Indian male neural voices; it is the English fallback only.
  const result = await polly().send(
    new SynthesizeSpeechCommand({
      Text: text,
      VoiceId: (process.env.POLLY_VOICE_ID ?? 'Matthew') as 'Matthew',
      Engine: 'neural',
      OutputFormat: 'mp3',
    })
  )
  if (!result.AudioStream) throw new Error('Polly returned no audio')
  const chunks: Uint8Array[] = []
  for await (const chunk of result.AudioStream as AsyncIterable<Uint8Array>) chunks.push(chunk)
  return { audio: Buffer.concat(chunks), contentType: 'audio/mpeg' }
}

// ── Google Cloud TTS (REST, API key) ────────────────────────────────────────
// Two quality tiers, picked per request from the user's plan (see app/api/tts):
//   standard → WaveNet (about $4 per million characters, with a monthly free allowance)
//   hd       → Chirp 3 HD (about $30 per million characters, most natural)
// Env overrides:
//   GOOGLE_TTS_VOICE      standard voice (a persona name is reused across languages)
//   GOOGLE_TTS_VOICE_HD   HD voice, default en-IN-Chirp3-HD-Charon
//   GOOGLE_TTS_VOICE_<LOCALE>[_HD], e.g. GOOGLE_TTS_VOICE_HI_IN or GOOGLE_TTS_VOICE_TA_IN_HD
export type VoiceQuality = 'standard' | 'hd'

const DEFAULT_HD_VOICE = 'en-IN-Chirp3-HD-Charon'
// Male WaveNet voices exist for these locales; other Indian languages use the Chirp 3 HD
// persona, which Google offers in every Indian locale it supports.
const WAVENET_MALE: Record<string, string> = { 'en-IN': 'en-IN-Wavenet-B', 'hi-IN': 'hi-IN-Wavenet-B' }

/** Same voice persona in another language: "en-IN-Chirp3-HD-Charon" → "hi-IN-Chirp3-HD-Charon". */
function inLocale(voice: string, locale: string): string {
  return voice.startsWith(locale) ? voice : `${locale}-${voice.split('-').slice(2).join('-')}`
}

export function googleVoiceFor(locale?: string, quality: VoiceQuality = 'standard'): string {
  const loc = locale || 'en-IN'
  const override = process.env[`GOOGLE_TTS_VOICE_${loc.replace('-', '_').toUpperCase()}${quality === 'hd' ? '_HD' : ''}`]
  if (override) return override
  const hd = inLocale(process.env.GOOGLE_TTS_VOICE_HD || DEFAULT_HD_VOICE, loc)
  if (quality === 'hd') return hd
  const standard = process.env.GOOGLE_TTS_VOICE
  if (standard) return inLocale(standard, loc)
  return WAVENET_MALE[loc] ?? hd
}

const synthGoogle: Synth = async (text, opts) => {
  const key = process.env.GOOGLE_TTS_API_KEY ?? process.env.GEMINI_API_KEY
  if (!key) throw new Error('GOOGLE_TTS_API_KEY not set')
  const voiceName = googleVoiceFor(opts.locale, opts.quality)
  const languageCode = voiceName.slice(0, 5) // "en-IN" / "hi-IN"
  // Key goes in a header, not the URL, so it never lands in proxy/access logs.
  const res = await fetchWithTimeout('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode, name: voiceName },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  })
  if (!res.ok) throw new HttpError(res.status, `Google TTS ${res.status}`)
  const data = (await res.json()) as { audioContent?: string }
  if (!data.audioContent) throw new Error('Google TTS returned no audio')
  return { audio: Buffer.from(data.audioContent, 'base64'), contentType: 'audio/mpeg' }
}

// ── Sarvam Bulbul ───────────────────────────────────────────────────────────
// Verify the field names against https://docs.sarvam.ai before relying on this in prod.
const synthSarvam: Synth = async (text, opts) => {
  const key = process.env.SARVAM_API_KEY
  if (!key) throw new Error('SARVAM_API_KEY not set')
  const res = await fetchWithTimeout('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
    body: JSON.stringify({
      text,
      target_language_code: opts.locale ?? process.env.SARVAM_TTS_LANGUAGE ?? 'en-IN',
      model: process.env.SARVAM_TTS_MODEL ?? 'bulbul:v3',
      ...(process.env.SARVAM_TTS_SPEAKER ? { speaker: process.env.SARVAM_TTS_SPEAKER } : {}),
      speech_sample_rate: 22050,
    }),
  })
  if (!res.ok) throw new HttpError(res.status, `Sarvam TTS ${res.status}`)
  const data = (await res.json()) as { audios?: string[] }
  const b64 = data.audios?.[0]
  if (!b64) throw new Error('Sarvam TTS returned no audio')
  return { audio: Buffer.from(b64, 'base64'), contentType: 'audio/wav' }
}

const PROVIDERS: Record<TTSProviderName, Synth> = {
  polly: synthPolly,
  google: synthGoogle,
  sarvam: synthSarvam,
}

function resolve(name: string | undefined): TTSProviderName | undefined {
  return name && name in PROVIDERS ? (name as TTSProviderName) : undefined
}

export function activeTTSProvider(): TTSProviderName {
  return resolve(process.env.TTS_PROVIDER) ?? 'polly'
}

export async function synthesize(text: string, opts: TTSOptions = {}): Promise<TTSResult> {
  const primary = activeTTSProvider()
  const fallback = resolve(process.env.TTS_FALLBACK)
  try {
    // Synthesis is idempotent, so transient provider errors (429/5xx/network) are retried.
    return await withRetry(() => PROVIDERS[primary](text, opts), { retries: 1 })
  } catch (err) {
    if (!fallback || fallback === primary) throw err
    console.warn(`[tts] ${primary} failed — falling back to ${fallback}:`, err instanceof Error ? err.message : err)
    return PROVIDERS[fallback](text, opts)
  }
}
