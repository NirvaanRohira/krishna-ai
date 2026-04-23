import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { transcribeAudioGroq, transcribeAudio } from '@/lib/transcribe'

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const audio = formData.get('audio') as File | null
  if (!audio) return NextResponse.json({ error: 'No audio provided' }, { status: 400 })

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
      const msg = err instanceof Error ? err.message : 'Transcription failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }
}
