import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'

const polly = new PollyClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const MAX_CHARS = 3000

export async function POST(req: Request) {
  const { text } = await req.json()
  if (!text || typeof text !== 'string') return new Response('Bad request', { status: 400 })

  const trimmed = text.slice(0, MAX_CHARS)

  const command = new SynthesizeSpeechCommand({
    Text: trimmed,
    VoiceId: 'Matthew',
    Engine: 'neural',
    OutputFormat: 'mp3',
  })

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
}
