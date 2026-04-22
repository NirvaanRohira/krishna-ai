import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ startSession: vi.fn(), saveExchange: vi.fn() }))
vi.mock('@/lib/retrieval/complexityRouter', () => ({ classifyComplexity: vi.fn() }))
vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/crag/loop', () => ({ runCRAG: vi.fn() }))
vi.mock('@/lib/guardrails/classifier', () => ({ classifyMessage: vi.fn() }))
vi.mock('@/lib/retrieval/structuralLookup', () => ({ queryStructuralLookup: vi.fn() }))
vi.mock('@/lib/retrieval/contextRetrieval', () => ({ getContextVector: vi.fn() }))
vi.mock('@/lib/gemini', () => ({ embedText: vi.fn(), EMBEDDING_DIMENSION: 1536 }))
vi.mock('@/lib/llm', () => ({ generateText: vi.fn(), generateTextStream: vi.fn(), classify: vi.fn() }))

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

function makeMockFromChain() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { turn_count: 0 }, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
  }
  return vi.fn().mockReturnValue(chain)
}

function makeMockSupabase(user: object | null = FAKE_USER) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: makeMockFromChain(),
  }
}

async function parseStream(res: Response): Promise<{ sessionId: string; response: string; sources: unknown[] }> {
  const text = await res.text()
  let sessionId = '', response = '', sources: unknown[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue
    try {
      const d = JSON.parse(line.slice(6))
      if (d.t === 's') { sessionId = d.id; sources = d.src }
      if (d.t === 'c') response += d.v
    } catch { /* skip malformed lines */ }
  }
  return { sessionId, response, sources }
}

describe('POST /api/chat — auth and persistence', () => {
  let startSession: ReturnType<typeof vi.fn>
  let saveExchange: ReturnType<typeof vi.fn>
  let classifyComplexity: ReturnType<typeof vi.fn>
  let parallelRetrieve: ReturnType<typeof vi.fn>
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

    const groq = await import('@/lib/llm')
    vi.mocked(groq.generateText).mockResolvedValue('The Gita teaches us...')
    vi.mocked(groq.generateTextStream as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      yield 'The Gita teaches us...'
    })

    const guardrail = await import('@/lib/guardrails/classifier')
    vi.mocked(guardrail.classifyMessage).mockResolvedValue('SAFE')

    const l3 = await import('@/lib/retrieval/structuralLookup')
    vi.mocked(l3.queryStructuralLookup).mockResolvedValue([])

    const l4 = await import('@/lib/retrieval/contextRetrieval')
    vi.mocked(l4.getContextVector).mockResolvedValue(null)
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
    const { sessionId } = await parseStream(res)
    expect(sessionId).toBe(FAKE_SESSION_ID)
  })

  it('creates a new session when sessionId is not provided', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'test' }))
    await parseStream(res) // consume stream so background work finishes
    expect(startSession).toHaveBeenCalledWith(expect.anything(), FAKE_USER.id)
  })

  it('reuses existing sessionId when provided in request body', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'follow-up', sessionId: 'existing-sess' })))
    expect(startSession).not.toHaveBeenCalled()
    const { sessionId } = await parseStream(await POST(makeRequest({ message: 'another', sessionId: 'existing-sess' })))
    expect(sessionId).toBe('existing-sess')
  })

  it('calls saveExchange with user message, response, and sources', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'what is karma?' })))
    expect(saveExchange).toHaveBeenCalledWith(
      expect.anything(),
      FAKE_SESSION_ID,
      'what is karma?',
      'The Gita teaches us...',
      FAKE_SOURCES
    )
  })
})
