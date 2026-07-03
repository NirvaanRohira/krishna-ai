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
    // limit is 20/min keyed on the same user id
    for (let i = 0; i < 21; i++) {
      last = await POST(makeRequest({ text: 'spam' }))
    }
    expect(last!.status).toBe(429)
    expect(last!.headers.get('Retry-After')).toBeTruthy()
  })
})
