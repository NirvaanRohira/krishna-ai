import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ startSession: vi.fn(), saveExchange: vi.fn() }))
vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/retrieval/complexityRouter', () => ({ classifyComplexity: vi.fn() }))
vi.mock('@/lib/crag/loop', () => ({ runCRAG: vi.fn() }))
vi.mock('@/lib/gemini', () => ({
  generateText: vi.fn(),
  embedText: vi.fn(),
  classify: vi.fn(),
  EMBEDDING_DIMENSION: 3072,
}))

const FAKE_SOURCES = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karmanye vadhikaraste...', theme_tags: ['karma'], score: 0.032 },
  { id: 2, text_source: 'bhagavad_gita', book_chapter: 3, verse: 19, text: 'tasmad asaktah...', theme_tags: ['duty'], score: 0.028 },
]

function makeRequest(body: object) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeMockSupabase(user: object | null = { id: 'user-123' }) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) } }
}

describe('POST /api/chat', () => {
  let parallelRetrieve: ReturnType<typeof vi.fn>
  let generateText: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(makeMockSupabase() as never)

    const session = await import('@/lib/session')
    vi.mocked(session.startSession).mockResolvedValue('sess-123')
    vi.mocked(session.saveExchange).mockResolvedValue(undefined)

    const router = await import('@/lib/retrieval/complexityRouter')
    vi.mocked(router.classifyComplexity).mockResolvedValue('SIMPLE')

    const parallel = await import('@/lib/retrieval/parallelRetrieval')
    parallelRetrieve = vi.mocked(parallel.parallelRetrieve)
    parallelRetrieve.mockResolvedValue(FAKE_SOURCES)

    const gemini = await import('@/lib/gemini')
    generateText = vi.mocked(gemini.generateText)
    generateText.mockResolvedValue('The Gita teaches us that action without attachment is the path. What situation brings this question to you today?')
  })

  it('returns 200 with response text and sources', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'I feel paralyzed by duty' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.response).toBe('string')
    expect(json.response.length).toBeGreaterThan(0)
    expect(Array.isArray(json.sources)).toBe(true)
  })

  it('calls parallelRetrieve with the user message', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await POST(makeRequest({ message: 'Who am I really' }))
    expect(parallelRetrieve).toHaveBeenCalledWith('Who am I really', expect.anything())
  })

  it('calls generateText with a prompt containing retrieved verse text', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await POST(makeRequest({ message: 'test question' }))
    const promptArg = generateText.mock.calls[0][0] as string
    expect(promptArg).toContain('karmanye vadhikaraste')
  })

  it('includes conversation history in the prompt when provided', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const history = [
      { role: 'user', content: 'prior question' },
      { role: 'assistant', content: 'prior answer' },
    ]
    await POST(makeRequest({ message: 'follow-up question', history }))
    const promptArg = generateText.mock.calls[0][0] as string
    expect(promptArg).toContain('prior question')
    expect(promptArg).toContain('prior answer')
  })

  it('returns sources from parallelRetrieve in the response', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'test' }))
    const json = await res.json()
    expect(json.sources).toHaveLength(2)
    expect(json.sources[0].verse).toBe(47)
  })

  it('returns 400 when message is missing', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 500 when generation fails', async () => {
    generateText.mockRejectedValue(new Error('Gemini timeout'))
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'test' }))
    expect(res.status).toBe(500)
  })
})
