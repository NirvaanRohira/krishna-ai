import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ startSession: vi.fn(), saveExchange: vi.fn() }))
vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/retrieval/complexityRouter', () => ({ classifyComplexity: vi.fn() }))
vi.mock('@/lib/crag/loop', () => ({ runCRAG: vi.fn() }))
vi.mock('@/lib/guardrails/classifier', () => ({ classifyMessage: vi.fn() }))
vi.mock('@/lib/memory/profileInjector', () => ({ loadAndInjectProfile: vi.fn() }))
vi.mock('@/lib/retrieval/structuralLookup', () => ({ queryStructuralLookup: vi.fn() }))
vi.mock('@/lib/retrieval/contextRetrieval', () => ({ getContextVector: vi.fn() }))
vi.mock('@/lib/gemini', () => ({ embedText: vi.fn(), EMBEDDING_DIMENSION: 1536 }))
vi.mock('@/lib/llm', () => ({ generateText: vi.fn(), generateTextStream: vi.fn(), classify: vi.fn() }))

const FAKE_SOURCES = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karmanye vadhikaraste', theme_tags: ['karma'], score: 0.8 },
]

const FAKE_L3_RESULT = {
  id: 1, label: 'Fear of death', intent_keywords: ['death', 'dying'],
  text_source: 'bhagavad_gita', book_chapter: 2, verse_start: 17, verse_end: 30,
}

function makeRequest(body: object) {
  return new Request('http://localhost/api/chat', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeMockSupabase(user: object | null = { id: 'user-123' }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { turn_count: 0 }, error: null }),
  }
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) }, from: vi.fn().mockReturnValue(chain) }
}

async function parseStream(res: Response): Promise<{ response: string; sources: unknown[] }> {
  const text = await res.text()
  let response = '', sources: unknown[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue
    try {
      const d = JSON.parse(line.slice(6))
      if (d.t === 's') sources = d.src
      if (d.t === 'c') response += d.v
    } catch { /* skip */ }
  }
  return { response, sources }
}

describe('POST /api/chat — L3 structural lookup + L4 context retrieval + real streaming', () => {
  let queryStructuralLookup: ReturnType<typeof vi.fn>
  let getContextVector: ReturnType<typeof vi.fn>
  let generateTextStream: ReturnType<typeof vi.fn>
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
    vi.mocked(parallel.parallelRetrieve).mockResolvedValue(FAKE_SOURCES)

    const crag = await import('@/lib/crag/loop')
    vi.mocked(crag.runCRAG).mockResolvedValue({ response: 'CRAG response', sources: FAKE_SOURCES })

    const guardrail = await import('@/lib/guardrails/classifier')
    vi.mocked(guardrail.classifyMessage).mockResolvedValue('SAFE')

    const memory = await import('@/lib/memory/profileInjector')
    vi.mocked(memory.loadAndInjectProfile).mockResolvedValue('System prompt')

    const l3 = await import('@/lib/retrieval/structuralLookup')
    queryStructuralLookup = vi.mocked(l3.queryStructuralLookup)
    queryStructuralLookup.mockResolvedValue([])

    const l4 = await import('@/lib/retrieval/contextRetrieval')
    getContextVector = vi.mocked(l4.getContextVector)
    getContextVector.mockResolvedValue(null)

    const groq = await import('@/lib/llm')
    generateText = vi.mocked(groq.generateText)
    generateTextStream = vi.mocked(groq.generateTextStream as ReturnType<typeof vi.fn>)
    generateTextStream.mockImplementation(async function* () {
      yield 'Hello '
      yield 'world'
    })
  })

  it('SIMPLE path calls queryStructuralLookup with keywords from the message', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'fear death dying' })))
    expect(queryStructuralLookup).toHaveBeenCalledWith(
      expect.arrayContaining(['fear', 'death', 'dying']),
      expect.anything()
    )
  })

  it('SIMPLE path calls getContextVector with the authenticated user id', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'Who am I' })))
    expect(getContextVector).toHaveBeenCalledWith('user-123', expect.anything())
  })

  it('SIMPLE path uses generateTextStream (real streaming) instead of generateText', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'What is dharma?' })))
    expect(generateTextStream).toHaveBeenCalled()
    expect(generateText).not.toHaveBeenCalled()
  })

  it('SIMPLE path yields streamed chunks as SSE content events', async () => {
    generateTextStream.mockImplementation(async function* () {
      yield 'The soul '
      yield 'is eternal'
    })
    const { POST } = await import('@/app/api/chat/route')
    const { response } = await parseStream(await POST(makeRequest({ message: 'test' })))
    expect(response).toBe('The soul is eternal')
  })

  it('COMPLEX path also calls queryStructuralLookup', async () => {
    const router = await import('@/lib/retrieval/complexityRouter')
    vi.mocked(router.classifyComplexity).mockResolvedValue('COMPLEX')
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'I feel consumed by grief over my father' })))
    expect(queryStructuralLookup).toHaveBeenCalled()
  })

  it('COMPLEX path also calls getContextVector', async () => {
    const router = await import('@/lib/retrieval/complexityRouter')
    vi.mocked(router.classifyComplexity).mockResolvedValue('COMPLEX')
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'deep existential question' })))
    expect(getContextVector).toHaveBeenCalledWith('user-123', expect.anything())
  })

  it('works correctly when getContextVector returns null (user has no stored summary)', async () => {
    getContextVector.mockResolvedValue(null)
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'What is karma?' }))
    expect(res.status).toBe(200)
    const { response } = await parseStream(res)
    expect(response.length).toBeGreaterThan(0)
  })

  it('works correctly when queryStructuralLookup returns no matches', async () => {
    queryStructuralLookup.mockResolvedValue([])
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'something obscure' }))
    expect(res.status).toBe(200)
    const { response } = await parseStream(res)
    expect(response.length).toBeGreaterThan(0)
  })

  it('L3 anchor results are passed to the prompt builder as context', async () => {
    queryStructuralLookup.mockResolvedValue([FAKE_L3_RESULT])
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'I fear dying' })))
    // generateTextStream should have been called with a prompt referencing the anchor
    const promptArg = (generateTextStream.mock.calls[0] as [string])[0]
    expect(promptArg).toContain('Fear of death')
  })
})
