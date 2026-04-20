import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/retrieval/dense', () => ({
  denseRetrieve: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}))

const FAKE_RESULTS = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karmanye...', theme_tags: ['karma'], similarity: 0.92 },
]

describe('POST /api/retrieve', () => {
  let denseRetrieve: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const dense = await import('@/lib/retrieval/dense')
    denseRetrieve = vi.mocked(dense.denseRetrieve)
    denseRetrieve.mockResolvedValue(FAKE_RESULTS)
  })

  it('returns 200 with results for a valid query', async () => {
    const { POST } = await import('@/app/api/retrieve/route')
    const req = new Request('http://localhost/api/retrieve', {
      method: 'POST',
      body: JSON.stringify({ query: 'I feel paralyzed by duty' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toHaveLength(1)
    expect(json.results[0].verse).toBe(47)
  })

  it('calls denseRetrieve with the query from the request body', async () => {
    const { POST } = await import('@/app/api/retrieve/route')
    const req = new Request('http://localhost/api/retrieve', {
      method: 'POST',
      body: JSON.stringify({ query: 'Who am I really' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(denseRetrieve).toHaveBeenCalledWith('Who am I really', expect.anything())
  })

  it('returns 400 when query is missing', async () => {
    const { POST } = await import('@/app/api/retrieve/route')
    const req = new Request('http://localhost/api/retrieve', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when denseRetrieve throws', async () => {
    denseRetrieve.mockRejectedValue(new Error('rpc failed'))
    const { POST } = await import('@/app/api/retrieve/route')
    const req = new Request('http://localhost/api/retrieve', {
      method: 'POST',
      body: JSON.stringify({ query: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
