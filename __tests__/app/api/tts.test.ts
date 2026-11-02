import { describe, it, expect, vi, beforeEach } from 'vitest'

// The default provider is Google Cloud TTS over fetch; tests never reach the network.
const googleOk = () => new Response(JSON.stringify({ audioContent: Buffer.from([1, 2, 3]).toString('base64') }), { status: 200 })
const mockFetch = vi.fn()

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))

const FAKE_USER = { id: 'user-tts-1' }

function makeMockSupabase(user: object | null = FAKE_USER) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  }
}

function makeRequest(body: object) {
  return new Request('http://localhost/api/tts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}


describe('POST /api/tts', () => {
  let createServerSupabaseClient: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubEnv('GOOGLE_TTS_API_KEY', 'g-key')
    mockFetch.mockReset()
    mockFetch.mockImplementation(async () => googleOk())
    vi.stubGlobal('fetch', mockFetch)

    const supabaseLib = await import('@/lib/supabase-server')
    createServerSupabaseClient = vi.mocked(supabaseLib.createServerSupabaseClient)
    createServerSupabaseClient.mockResolvedValue(makeMockSupabase() as never)

    const { __resetRateLimitStore } = await import('@/lib/rateLimit')
    __resetRateLimitStore()
  })

  it('returns 401 when the user is not authenticated', async () => {
    createServerSupabaseClient.mockResolvedValue(makeMockSupabase(null) as never)
    const { POST } = await import('@/app/api/tts/route')
    const res = await POST(makeRequest({ text: 'hello' }))
    expect(res.status).toBe(401)
    // The paid voice service must never be called for an unauthenticated caller.
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns 400 when text is missing', async () => {
    const { POST } = await import('@/app/api/tts/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns audio/mpeg for an authenticated request', async () => {
    const { POST } = await import('@/app/api/tts/route')
    const res = await POST(makeRequest({ text: 'Hare Krishna' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
  })

  it('caps text at 3000 characters before synthesis', async () => {
    const { POST } = await import('@/app/api/tts/route')
    await POST(makeRequest({ text: 'x'.repeat(5000) }))
    const body = JSON.parse(mockFetch.mock.calls[0][1].body) as { input: { text: string } }
    expect(body.input.text.length).toBe(3000)
  })

  it('returns a generic 500 (no raw error) when the voice service throws', async () => {
    mockFetch.mockRejectedValue(new Error('secret internal detail'))
    const { POST } = await import('@/app/api/tts/route')
    const res = await POST(makeRequest({ text: 'hello' }))
    expect(res.status).toBe(500)
    const bodyText = await res.text()
    expect(bodyText).not.toContain('secret internal detail')
  })

  it('returns 429 once the per-user rate limit is exceeded', async () => {
    const { POST } = await import('@/app/api/tts/route')
    let last: Response | undefined
    // limit is 60/min keyed on the same user id
    for (let i = 0; i < 61; i++) {
      last = await POST(makeRequest({ text: 'spam' }))
    }
    expect(last!.status).toBe(429)
    expect(last!.headers.get('Retry-After')).toBeTruthy()
  })

  it('uses Google Cloud TTS with an Indian voice when TTS_PROVIDER=google', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google')
    vi.stubEnv('GOOGLE_TTS_API_KEY', 'g-key')
    vi.stubEnv('GOOGLE_TTS_VOICE', 'hi-IN-Chirp3-HD-Charon')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ audioContent: Buffer.from([9, 9]).toString('base64') }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { POST } = await import('@/app/api/tts/route')
      const res = await POST(makeRequest({ text: 'Namaste' }))
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).not.toContain('g-key') // API key travels in a header, never the URL
      expect(init.headers['x-goog-api-key']).toBe('g-key')
      const body = JSON.parse(init.body)
      // English text → English (India) variant of the configured voice persona
      expect(body.voice).toEqual({ languageCode: 'en-IN', name: 'en-IN-Chirp3-HD-Charon' })
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })

  it('speaks Hindi text with the Hindi variant of the configured voice', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google')
    vi.stubEnv('GOOGLE_TTS_API_KEY', 'g-key')
    vi.stubEnv('GOOGLE_TTS_VOICE', 'en-IN-Chirp3-HD-Charon')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ audioContent: Buffer.from([1]).toString('base64') }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { POST } = await import('@/app/api/tts/route')
      await POST(makeRequest({ text: 'कर्म करो, फल की चिंता मत करो।' }))
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.voice).toEqual({ languageCode: 'hi-IN', name: 'hi-IN-Chirp3-HD-Charon' })
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })

  it('free and Plus users get the cheaper WaveNet voice; Premium gets Chirp 3 HD', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google')
    vi.stubEnv('GOOGLE_TTS_API_KEY', 'g-key')
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ audioContent: Buffer.from([1]).toString('base64') }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const withPlan = (plan: string) => ({
      ...makeMockSupabase(),
      rpc: vi.fn().mockResolvedValue({ data: { allowed: true, reason: 'ok', plan }, error: null }),
    })
    try {
      const { POST } = await import('@/app/api/tts/route')
      const voiceFor = async (plan: string, text: string) => {
        createServerSupabaseClient.mockResolvedValue(withPlan(plan) as never)
        fetchMock.mockClear()
        await POST(makeRequest({ text }))
        return JSON.parse(fetchMock.mock.calls[0][1].body).voice.name
      }
      expect(await voiceFor('free', 'Namaste friend')).toBe('en-IN-Wavenet-B')
      expect(await voiceFor('plus', 'कर्म करो, फल की चिंता मत करो।')).toBe('hi-IN-Wavenet-B')
      expect(await voiceFor('premium', 'Namaste friend')).toBe('en-IN-Chirp3-HD-Charon')
      expect(await voiceFor('premium', 'कर्म करो, फल की चिंता मत करो।')).toBe('hi-IN-Chirp3-HD-Charon')
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })

  it('which plans get the HD voice is configurable (TTS_HD_PLANS)', async () => {
    vi.stubEnv('TTS_PROVIDER', 'google')
    vi.stubEnv('GOOGLE_TTS_API_KEY', 'g-key')
    vi.stubEnv('TTS_HD_PLANS', 'plus,premium')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ audioContent: Buffer.from([1]).toString('base64') }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    createServerSupabaseClient.mockResolvedValue({
      ...makeMockSupabase(),
      rpc: vi.fn().mockResolvedValue({ data: { allowed: true, reason: 'ok', plan: 'plus' }, error: null }),
    } as never)
    try {
      const { POST } = await import('@/app/api/tts/route')
      await POST(makeRequest({ text: 'Namaste friend' }))
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).voice.name).toBe('en-IN-Chirp3-HD-Charon')
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })

  it('falls back to the second provider when the primary fails (TTS_FALLBACK)', async () => {
    vi.stubEnv('TTS_PROVIDER', 'sarvam')
    vi.stubEnv('SARVAM_API_KEY', 's-key')
    vi.stubEnv('TTS_FALLBACK', 'google')
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      String(url).includes('sarvam') ? new Response('nope', { status: 503 }) : googleOk())
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { POST } = await import('@/app/api/tts/route')
      const res = await POST(makeRequest({ text: 'Namaste' }))
      expect(res.status).toBe(200)
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('texttospeech.googleapis.com'))).toBe(true)
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })
})
