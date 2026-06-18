import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ startSession: vi.fn(), saveExchange: vi.fn() }))
vi.mock('@/lib/retrieval/complexityRouter', () => ({ classifyComplexity: vi.fn() }))
vi.mock('@/lib/crag/loop', () => ({ runCRAG: vi.fn() }))
vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/guardrails/classifier', () => ({ classifyMessage: vi.fn() }))
vi.mock('@/lib/retrieval/structuralLookup', () => ({ queryStructuralLookup: vi.fn() }))
vi.mock('@/lib/retrieval/contextRetrieval', () => ({ getContextVector: vi.fn() }))
vi.mock('@/lib/memory/profileInjector', () => ({ loadAndInjectProfile: vi.fn() }))
vi.mock('@/lib/gemini', () => ({ embedText: vi.fn(), EMBEDDING_DIMENSION: 1536 }))
vi.mock('@/lib/llm', () => ({ generateText: vi.fn(), generateTextStream: vi.fn(), classify: vi.fn() }))

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

function makeMockSupabase() {
  const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { turn_count: 0 }, error: null }) }
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }) }, from: vi.fn().mockReturnValue(chain) }
}

async function drainStream(res: Response): Promise<boolean> {
  const text = await res.text()
  return text.includes('[DONE]')
}

describe('POST /api/chat — latency optimizations', () => {
  let getContextVector: ReturnType<typeof vi.fn>
  let classifyComplexity: ReturnType<typeof vi.fn>
  let classifyMessage: ReturnType<typeof vi.fn>
  let parallelRetrieve: ReturnType<typeof vi.fn>
  let queryStructuralLookup: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(makeMockSupabase() as never)

    const session = await import('@/lib/session')
    vi.mocked(session.startSession).mockResolvedValue('sess-123')
    vi.mocked(session.saveExchange).mockResolvedValue(undefined)

    const router = await import('@/lib/retrieval/complexityRouter')
    classifyComplexity = vi.mocked(router.classifyComplexity)
    classifyComplexity.mockResolvedValue('SIMPLE')

    const parallel = await import('@/lib/retrieval/parallelRetrieval')
    parallelRetrieve = vi.mocked(parallel.parallelRetrieve)
    parallelRetrieve.mockResolvedValue(FAKE_SOURCES)

    const guardrail = await import('@/lib/guardrails/classifier')
    classifyMessage = vi.mocked(guardrail.classifyMessage)
    classifyMessage.mockResolvedValue('SAFE')

    const l3 = await import('@/lib/retrieval/structuralLookup')
    queryStructuralLookup = vi.mocked(l3.queryStructuralLookup)
    queryStructuralLookup.mockResolvedValue([])

    const l4 = await import('@/lib/retrieval/contextRetrieval')
    getContextVector = vi.mocked(l4.getContextVector)
    getContextVector.mockResolvedValue(null)

    const profileLib = await import('@/lib/memory/profileInjector')
    vi.mocked(profileLib.loadAndInjectProfile).mockResolvedValue('mock system prompt')

    const crag = await import('@/lib/crag/loop')
    vi.mocked(crag.runCRAG).mockResolvedValue({ response: 'CRAG response', sources: FAKE_SOURCES })

    const llm = await import('@/lib/llm')
    vi.mocked(llm.generateTextStream as ReturnType<typeof vi.fn>).mockImplementation(async function* () { yield 'Jai Shri Krishna, dear seeker.' })
    vi.mocked(llm.generateText).mockResolvedValue('Jai Shri Krishna, dear seeker.')
  })

  // ── Fix 2: getContextVector is dead code — remove from the hot path ────
  it('never calls getContextVector for a normal SIMPLE message', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'What is dharma?' }))
    await drainStream(res)
    expect(getContextVector).not.toHaveBeenCalled()
  })

  it('never calls getContextVector even for a COMPLEX message', async () => {
    classifyComplexity.mockResolvedValue('COMPLEX')
    const crag = await import('@/lib/crag/loop')
    vi.mocked(crag.runCRAG).mockResolvedValue({ response: 'deep answer', sources: [] })

    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'I feel lost and cannot find my purpose in life' }))
    await drainStream(res)
    expect(getContextVector).not.toHaveBeenCalled()
  })

  // ── Fix 1: Greeting pre-filter bypasses LLM classification and retrieval ──
  it('bypasses classifyComplexity for a single-word greeting', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'hi' }))
    await drainStream(res)
    expect(classifyComplexity).not.toHaveBeenCalled()
  })

  it('bypasses classifyMessage for a single-word greeting', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'hello' }))
    await drainStream(res)
    expect(classifyMessage).not.toHaveBeenCalled()
  })

  it('bypasses parallelRetrieve for a greeting', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'namaste' }))
    await drainStream(res)
    expect(parallelRetrieve).not.toHaveBeenCalled()
  })

  it('bypasses queryStructuralLookup for a greeting', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'how are you' }))
    await drainStream(res)
    expect(queryStructuralLookup).not.toHaveBeenCalled()
  })

  it('still returns a valid SSE stream ending with [DONE] for a greeting', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'hare krishna' }))
    expect(res.status).toBe(200)
    const done = await drainStream(res)
    expect(done).toBe(true)
  })

  it('recognises multi-word greeting variants', async () => {
    const { POST } = await import('@/app/api/chat/route')
    for (const msg of ['good morning', 'hey there', 'hello krishna']) {
      vi.clearAllMocks()
      const supabaseLib = await import('@/lib/supabase-server')
      vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(makeMockSupabase() as never)
      const session = await import('@/lib/session')
      vi.mocked(session.startSession).mockResolvedValue('sess-123')
      vi.mocked(session.saveExchange).mockResolvedValue(undefined)
      const llm = await import('@/lib/llm')
      vi.mocked(llm.generateTextStream as ReturnType<typeof vi.fn>).mockImplementation(async function* () { yield 'Namaste.' })

      const res = await POST(makeRequest({ message: msg }))
      await drainStream(res)
      expect(classifyComplexity, `expected classifyComplexity not called for: "${msg}"`).not.toHaveBeenCalled()
    }
  })

  it('does NOT treat a substantive question as a greeting even if short', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'What is karma?' }))
    await drainStream(res)
    expect(classifyComplexity).toHaveBeenCalledWith('What is karma?')
  })

  it('does NOT treat a grief message as a greeting', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'I feel empty inside' }))
    await drainStream(res)
    expect(classifyComplexity).toHaveBeenCalled()
  })
})
