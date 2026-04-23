import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/transcribe', () => ({ transcribeAudio: vi.fn() }))

function makeMockSupabase(user: object | null = { id: 'user-123' }) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) } }
}

function makeAudioRequest(hasAudio = true) {
  const formData = new FormData()
  if (hasAudio) {
    const blob = new Blob(['audio'], { type: 'audio/webm' })
    formData.append('audio', new File([blob], 'audio.webm', { type: 'audio/webm' }))
  }
  return new Request('http://localhost/api/voice/transcribe', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/voice/transcribe', () => {
  let transcribeAudio: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(makeMockSupabase() as never)

    const transcribe = await import('@/lib/transcribe')
    transcribeAudio = vi.mocked(transcribe.transcribeAudio)
    transcribeAudio.mockResolvedValue('What is dharma?')
  })

  it('returns 401 when unauthenticated', async () => {
    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(makeMockSupabase(null) as never)
    const { POST } = await import('@/app/api/voice/transcribe/route')
    const res = await POST(makeAudioRequest())
    expect(res.status).toBe(401)
  })

  it('returns 400 when no audio in form data', async () => {
    const { POST } = await import('@/app/api/voice/transcribe/route')
    const res = await POST(makeAudioRequest(false))
    expect(res.status).toBe(400)
  })

  it('returns 200 with transcribed text', async () => {
    const { POST } = await import('@/app/api/voice/transcribe/route')
    const res = await POST(makeAudioRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.text).toBe('What is dharma?')
  })

  it('calls transcribeAudio with the uploaded file', async () => {
    const { POST } = await import('@/app/api/voice/transcribe/route')
    await POST(makeAudioRequest())
    expect(transcribeAudio).toHaveBeenCalledOnce()
  })

  it('returns 500 with error message when transcription fails', async () => {
    transcribeAudio.mockRejectedValueOnce(new Error('Whisper failed'))
    const { POST } = await import('@/app/api/voice/transcribe/route')
    const res = await POST(makeAudioRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})
