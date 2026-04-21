import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ startSession: vi.fn(), saveExchange: vi.fn() }))
vi.mock('@/lib/retrieval/complexityRouter', () => ({ classifyComplexity: vi.fn() }))
vi.mock('@/lib/crag/loop', () => ({ runCRAG: vi.fn() }))
vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/guardrails/classifier', () => ({ classifyMessage: vi.fn() }))
vi.mock('@/lib/gemini', () => ({
  generateText: vi.fn(),
  generateTextStream: vi.fn(),
  embedText: vi.fn(),
  classify: vi.fn(),
  EMBEDDING_DIMENSION: 1536,
}))

const FAKE_SOURCES = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karmanye vadhikaraste...', theme_tags: ['karma'], score: 0.8 },
]

function makeRequest(body: object) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeMockSupabase(user: object | null = { id: 'user-123' }) {
  const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { turn_count: 0 }, error: null }) }
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) }, from: vi.fn().mockReturnValue(chain) }
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

describe('POST /api/chat — complexity routing', () => {
  let classifyComplexity: ReturnType<typeof vi.fn>
  let runCRAG: ReturnType<typeof vi.fn>
  let parallelRetrieve: ReturnType<typeof vi.fn>
  let generateTextStream: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(makeMockSupabase() as never)

    const session = await import('@/lib/session')
    vi.mocked(session.startSession).mockResolvedValue('sess-123')
    vi.mocked(session.saveExchange).mockResolvedValue(undefined)

    const router = await import('@/lib/retrieval/complexityRouter')
    classifyComplexity = vi.mocked(router.classifyComplexity)

    const crag = await import('@/lib/crag/loop')
    runCRAG = vi.mocked(crag.runCRAG)
    runCRAG.mockResolvedValue({ response: 'CRAG response', sources: FAKE_SOURCES })

    const parallel = await import('@/lib/retrieval/parallelRetrieval')
    parallelRetrieve = vi.mocked(parallel.parallelRetrieve)
    parallelRetrieve.mockResolvedValue(FAKE_SOURCES)

    const gemini = await import('@/lib/gemini')
    generateTextStream = vi.mocked(gemini.generateTextStream as ReturnType<typeof vi.fn>)
    vi.mocked(gemini.generateText).mockResolvedValue('Fast path response')

    const guardrail = await import('@/lib/guardrails/classifier')
    vi.mocked(guardrail.classifyMessage).mockResolvedValue('SAFE')
  })

  it('uses fast path (parallelRetrieve + generateText) for SIMPLE queries', async () => {
    classifyComplexity.mockResolvedValue('SIMPLE')
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'Who is Arjuna?' }))
    expect(res.status).toBe(200)
    await parseStream(res)
    expect(parallelRetrieve).toHaveBeenCalled()
    expect(runCRAG).not.toHaveBeenCalled()
  })

  it('uses CRAG loop for COMPLEX queries', async () => {
    classifyComplexity.mockResolvedValue('COMPLEX')
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'I feel paralyzed by fear of failing my family' }))
    expect(res.status).toBe(200)
    await parseStream(res)
    expect(runCRAG).toHaveBeenCalled()
    expect(parallelRetrieve).not.toHaveBeenCalled()
  })

  it('returns CRAG response and sources for COMPLEX query', async () => {
    classifyComplexity.mockResolvedValue('COMPLEX')
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'why do I feel so lost?' }))
    const { response, sources } = await parseStream(res)
    expect(response).toBe('CRAG response')
    expect(sources).toHaveLength(1)
  })

  it('passes history to runCRAG for COMPLEX queries', async () => {
    classifyComplexity.mockResolvedValue('COMPLEX')
    const { POST } = await import('@/app/api/chat/route')
    const history = [{ role: 'user', content: 'prior question' }]
    await parseStream(await POST(makeRequest({ message: 'follow up', history })))
    // First arg is the (possibly enriched) retrieval query; second is the full history
    expect(runCRAG).toHaveBeenCalledWith(expect.any(String), history, expect.anything())
  })

  it('calls classifyComplexity with the user message', async () => {
    classifyComplexity.mockResolvedValue('SIMPLE')
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'What is dharma?' })))
    expect(classifyComplexity).toHaveBeenCalledWith('What is dharma?')
  })
})
