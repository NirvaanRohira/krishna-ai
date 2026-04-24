import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

export async function transcribeAudio(audio: Blob): Promise<string> {
  const base64 = Buffer.from(await audio.arrayBuffer()).toString('base64')
  const result = await model.generateContent([
    { inlineData: { mimeType: audio.type || 'audio/webm', data: base64 } },
    { text: 'Transcribe this audio exactly as spoken. Return only the spoken words, no commentary or formatting.' },
  ])
  const text = result.response.text().trim()
  if (!text) throw new Error('No transcription returned')
  return text
}

export async function transcribeAudioGroq(audio: Blob, filename = 'audio.webm'): Promise<string> {
  const form = new FormData()
  form.append('file', new File([audio], filename, { type: audio.type || 'audio/webm' }))
  form.append('model', 'whisper-large-v3')
  form.append('response_format', 'json')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Groq STT ${res.status}`)
  }
  const data = await res.json()
  return data.text
}
