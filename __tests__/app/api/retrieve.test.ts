import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/retrieval/dense', () => ({
  denseRetrieve: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))

const FAKE_USER = { id: 'user-abc-123' }

const FAKE_RESULTS = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karmanye...', theme_tags: ['karma'], similarity: 0.92 },
]

function makeMockSupabase(user: object | null = FAKE_USER) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  }
}

function makeRequest(body: object) {
  return new Request('http://localhost/api/retrieve', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/retrieve', () => {
  let denseRetrieve: ReturnType<typeof vi.fn>
  let createServerSupabaseClient: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const dense = await import('@/lib/retrieval/dense')
    denseRetrieve = vi.mocked(dense.denseRetrieve)
    denseRetrieve.mockResolvedValue(FAKE_RESULTS)

    const supabaseLib = await import('@/lib/supabase-server')
    createServerSupabaseClient = vi.mocked(supabaseLib.createServerSupabaseClient)
    createServerSupabaseClient.mockResolvedValue(makeMockSupabase() as never)

    // Reset the shared in-memory rate-limit store so counts don't leak across tests.
    const { __resetRateLimitStore } = await import('@/lib/rateLimit')
    __resetRateLimitStore()
  })

  it('returns 401 when the user is not authenticated', async () => {
    createServerSupabaseClient.mockResolvedValue(makeMockSupabase(null) as never)
    const { POST } = await import('@/app/api/retrieve/route')
    const res = await POST(makeRequest({ query: 'test' }))
    expect(res.status).toBe(401)
  })

  it('returns 200 with results for a valid query', async () => {
    const { POST } = await import('@/app/api/retrieve/route')
    const res = await POST(makeRequest({ query: 'I feel paralyzed by duty' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toHaveLength(1)
    expect(json.results[0].verse).toBe(47)
  })

  it('passes the user-scoped supabase client to denseRetrieve', async () => {
    const { POST } = await import('@/app/api/retrieve/route')
    await POST(makeRequest({ query: 'Who am I really' }))
    expect(denseRetrieve).toHaveBeenCalledWith(
      'Who am I really',
      expect.objectContaining({ supabaseClient: expect.anything() })
    )
  })

  it('returns 400 when query is missing', async () => {
    const { POST } = await import('@/app/api/retrieve/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 500 with a generic message when denseRetrieve throws', async () => {
    denseRetrieve.mockRejectedValue(new Error('rpc failed: secret internal detail'))
    const { POST } = await import('@/app/api/retrieve/route')
    const res = await POST(makeRequest({ query: 'test' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    // must NOT leak the raw error message to the client
    expect(JSON.stringify(json)).not.toContain('secret internal detail')
  })

  it('returns 429 once the per-user rate limit is exceeded', async () => {
    const { POST } = await import('@/app/api/retrieve/route')
    let last: Response | undefined
    // limit is 30/min keyed on the same user id
    for (let i = 0; i < 31; i++) {
      last = await POST(makeRequest({ query: 'spam' }))
    }
    expect(last!.status).toBe(429)
    expect(last!.headers.get('Retry-After')).toBeTruthy()
  })
})
