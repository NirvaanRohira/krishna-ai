import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Polly SDK so tests never hit AWS. send() is controllable per-test.
const mockSend = vi.fn()
vi.mock('@aws-sdk/client-polly', () => ({
  PollyClient: class {
    send = mockSend
  },
  SynthesizeSpeechCommand: vi.fn(function (this: Record<string, unknown>, input: unknown) {
    this.input = input
  }),
}))

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

// A minimal async-iterable audio stream, as Polly returns.
function fakeAudioStream() {
  return {
    async *[Symbol.asyncIterator]() {
      yield new Uint8Array([1, 2, 3])
    },
  }
}

describe('POST /api/tts', () => {
  let createServerSupabaseClient: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({ AudioStream: fakeAudioStream() })

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
    // Polly must never be invoked for an unauthenticated caller.
    expect(mockSend).not.toHaveBeenCalled()
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
    const { SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly')
    const { POST } = await import('@/app/api/tts/route')
    await POST(makeRequest({ text: 'x'.repeat(5000) }))
    const call = vi.mocked(SynthesizeSpeechCommand).mock.calls[0][0] as { Text: string }
    expect(call.Text.length).toBe(3000)
  })

  it('returns a generic 500 (no raw error) when Polly throws', async () => {
    mockSend.mockRejectedValue(new Error('AWS secret internal detail'))
    const { POST } = await import('@/app/api/tts/route')
    const res = await POST(makeRequest({ text: 'hello' }))
    expect(res.status).toBe(500)
    const bodyText = await res.text()
    expect(bodyText).not.toContain('AWS secret internal detail')
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
      expect(mockSend).not.toHaveBeenCalled()
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

  it('falls back to Polly when the primary provider fails and TTS_FALLBACK=polly', async () => {
    vi.stubEnv('TTS_PROVIDER', 'sarvam')
    vi.stubEnv('SARVAM_API_KEY', 's-key')
    vi.stubEnv('TTS_FALLBACK', 'polly')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })))
    try {
      const { POST } = await import('@/app/api/tts/route')
      const res = await POST(makeRequest({ text: 'Namaste' }))
      expect(res.status).toBe(200)
      expect(mockSend).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    }
  })
})
