import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const ANAM_SESSION_URL = 'https://api.anam.ai/v1/auth/session-token'

export async function POST(_request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANAM_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Anam not configured' }, { status: 500 })

  const personaConfig = {
    personaId: process.env.ANAM_PERSONA_ID || 'placeholder',
    name: process.env.ANAM_PERSONA_NAME || 'Krishna',
    avatarId: process.env.ANAM_AVATAR_ID || 'placeholder',
    voiceId: process.env.ANAM_VOICE_ID || 'placeholder',
    systemPrompt: 'You are a wise yogi and spiritual teacher drawing from the Bhagavad Gita and Upanishads. Speak warmly, briefly, and with calm authority.',
    maxSessionLengthSeconds: 170,
  }

  const res = await fetch(ANAM_SESSION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ personaConfig }),
  })

  if (!res.ok) {
    console.error('[anam/session] Anam API error', res.status)
    return NextResponse.json({ error: 'Failed to create Anam session' }, { status: 500 })
  }

  const { sessionToken } = await res.json()
  return NextResponse.json({ sessionToken })
}
