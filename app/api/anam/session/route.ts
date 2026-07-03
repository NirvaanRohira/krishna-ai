import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const ANAM_SESSION_URL = 'https://api.anam.ai/v1/auth/session-token'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANAM_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Anam not configured' }, { status: 500 })

  // Anam's built-in brain is disabled via llmId 'CUSTOMER_CLIENT_V1' — our RAG pipeline is
  // the brain, and the client streams the answer text to the avatar with
  // createTalkMessageStream(). (No systemPrompt: there is no Anam LLM to prompt.)
  // Two valid config shapes: reference a saved persona by id, OR build one inline from an
  // avatar + voice id. We support both so whichever id you have works by setting its env var.
  const LLM_ID = 'CUSTOMER_CLIENT_V1'
  const personaId = process.env.ANAM_PERSONA_ID
  const personaConfig = personaId
    ? { personaId, llmId: LLM_ID, maxSessionLengthSeconds: 170 }
    : {
        name: process.env.ANAM_PERSONA_NAME || 'Krishna',
        avatarId: process.env.ANAM_AVATAR_ID || 'placeholder',
        voiceId: process.env.ANAM_VOICE_ID || 'placeholder',
        llmId: LLM_ID,
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
