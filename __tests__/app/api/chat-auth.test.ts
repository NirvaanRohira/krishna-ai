import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ startSession: vi.fn(), saveExchange: vi.fn() }))
vi.mock('@/lib/retrieval/complexityRouter', () => ({ classifyComplexity: vi.fn() }))
vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/crag/loop', () => ({ runCRAG: vi.fn() }))
vi.mock('@/lib/gemini', () => ({
  generateText: vi.fn(),
  embedText: vi.fn(),
  classify: vi.fn(),
  EMBEDDING_DIMENSION: 3072,
}))

const FAKE_USER = { id: 'user-abc-123' }
const FAKE_SESSION_ID = 'sess-xyz-456'
const FAKE_SOURCES = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karmanye...', theme_tags: ['karma'], score: 0.8 },
]

function makeRequest(body: object) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeMockSupabase(user: object | null = FAKE_USER) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  }
}

describe('POST /api/chat — auth and persistence', () => {
  let startSession: ReturnType<typeof vi.fn>
  let saveExchange: ReturnType<typeof vi.fn>
  let classifyComplexity: ReturnType<typeof vi.fn>
  let parallelRetrieve: ReturnType<typeof vi.fn>
  let generateText: ReturnType<typeof vi.fn>
  let createServerSupabaseClient: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const supabaseLib = await import('@/lib/supabase-server')
    createServerSupabaseClient = vi.mocked(supabaseLib.createServerSupabaseClient)
    createServerSupabaseClient.mockResolvedValue(makeMockSupabase() as never)

    const session = await import('@/lib/session')
    startSession = vi.mocked(session.startSession)
    startSession.mockResolvedValue(FAKE_SESSION_ID)
    saveExchange = vi.mocked(session.saveExchange)
    saveExchange.mockResolvedValue(undefined)

    const router = await import('@/lib/retrieval/complexityRouter')
    classifyComplexity = vi.mocked(router.classifyComplexity)
    classifyComplexity.mockResolvedValue('SIMPLE')

    const parallel = await import('@/lib/retrieval/parallelRetrieval')
    parallelRetrieve = vi.mocked(parallel.parallelRetrieve)
    parallelRetrieve.mockResolvedValue(FAKE_SOURCES)

    const gemini = await import('@/lib/gemini')
    generateText = vi.mocked(gemini.generateText)
    generateText.mockResolvedValue('The Gita teaches us...')
  })

  it('returns 401 when user is not authenticated', async () => {
    createServerSupabaseClient.mockResolvedValue(makeMockSupabase(null) as never)
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'who am I?' }))
    expect(res.status).toBe(401)
  })

  it('returns 200 with sessionId for authenticated user', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'what is dharma?' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sessionId).toBe(FAKE_SESSION_ID)
  })

  it('creates a new session when sessionId is not provided', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await POST(makeRequest({ message: 'test' }))
    expect(startSession).toHaveBeenCalledWith(expect.anything(), FAKE_USER.id)
  })

  it('reuses existing sessionId when provided in request body', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await POST(makeRequest({ message: 'follow-up', sessionId: 'existing-sess' }))
    expect(startSession).not.toHaveBeenCalled()
    const json = await (await POST(makeRequest({ message: 'another', sessionId: 'existing-sess' }))).json()
    expect(json.sessionId).toBe('existing-sess')
  })

  it('calls saveExchange with user message, response, and sources', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await POST(makeRequest({ message: 'what is karma?' }))
    expect(saveExchange).toHaveBeenCalledWith(
      expect.anything(),
      FAKE_SESSION_ID,
      'what is karma?',
      'The Gita teaches us...',
      FAKE_SOURCES
    )
  })
})
