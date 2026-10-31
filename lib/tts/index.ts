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

export type TTSResult = { audio: Buffer; contentType: string }
export type TTSProviderName = 'polly' | 'google' | 'sarvam'

type Synth = (text: string) => Promise<TTSResult>

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
// Voice names: `en-IN-Chirp3-HD-<Name>` / `hi-IN-Chirp3-HD-<Name>` (HD, most natural),
// or cheaper `en-IN-Neural2-B` / `en-IN-Wavenet-C` (male). Check the voice list in
// the console for your project; set GOOGLE_TTS_VOICE to pick one.
const synthGoogle: Synth = async (text) => {
  const key = process.env.GOOGLE_TTS_API_KEY ?? process.env.GEMINI_API_KEY
  if (!key) throw new Error('GOOGLE_TTS_API_KEY not set')
  const voiceName = process.env.GOOGLE_TTS_VOICE ?? 'en-IN-Chirp3-HD-Charon'
  const languageCode = voiceName.slice(0, 5) // "en-IN" / "hi-IN"
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode, name: voiceName },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  })
  if (!res.ok) throw new Error(`Google TTS ${res.status}`)
  const data = (await res.json()) as { audioContent?: string }
  if (!data.audioContent) throw new Error('Google TTS returned no audio')
  return { audio: Buffer.from(data.audioContent, 'base64'), contentType: 'audio/mpeg' }
}

// ── Sarvam Bulbul ───────────────────────────────────────────────────────────
// Verify the field names against https://docs.sarvam.ai before relying on this in prod.
const synthSarvam: Synth = async (text) => {
  const key = process.env.SARVAM_API_KEY
  if (!key) throw new Error('SARVAM_API_KEY not set')
  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
    body: JSON.stringify({
      text,
      target_language_code: process.env.SARVAM_TTS_LANGUAGE ?? 'en-IN',
      model: process.env.SARVAM_TTS_MODEL ?? 'bulbul:v3',
      ...(process.env.SARVAM_TTS_SPEAKER ? { speaker: process.env.SARVAM_TTS_SPEAKER } : {}),
      speech_sample_rate: 22050,
    }),
  })
  if (!res.ok) throw new Error(`Sarvam TTS ${res.status}`)
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

export async function synthesize(text: string): Promise<TTSResult> {
  const primary = activeTTSProvider()
  const fallback = resolve(process.env.TTS_FALLBACK)
  try {
    return await PROVIDERS[primary](text)
  } catch (err) {
    if (!fallback || fallback === primary) throw err
    console.warn(`[tts] ${primary} failed — falling back to ${fallback}:`, err instanceof Error ? err.message : err)
    return PROVIDERS[fallback](text)
  }
}
