import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ startSession: vi.fn(), saveExchange: vi.fn() }))
vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/retrieval/complexityRouter', () => ({ classifyComplexity: vi.fn() }))
vi.mock('@/lib/crag/loop', () => ({ runCRAG: vi.fn() }))
vi.mock('@/lib/guardrails/classifier', () => ({ classifyMessage: vi.fn() }))
vi.mock('@/lib/retrieval/structuralLookup', () => ({ queryStructuralLookup: vi.fn() }))
vi.mock('@/lib/retrieval/contextRetrieval', () => ({ getContextVector: vi.fn() }))
vi.mock('@/lib/gemini', () => ({ embedText: vi.fn(), EMBEDDING_DIMENSION: 1536 }))
vi.mock('@/lib/llm', () => ({ generateText: vi.fn(), generateTextStream: vi.fn(), classify: vi.fn() }))

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
  const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { turn_count: 0 }, error: null }) }
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

describe('POST /api/chat', () => {
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
    vi.mocked(router.classifyComplexity).mockResolvedValue('SIMPLE')

    const parallel = await import('@/lib/retrieval/parallelRetrieval')
    parallelRetrieve = vi.mocked(parallel.parallelRetrieve)
    parallelRetrieve.mockResolvedValue(FAKE_SOURCES)

    const groq = await import('@/lib/llm')
    generateTextStream = vi.mocked(groq.generateTextStream as ReturnType<typeof vi.fn>)
    generateTextStream.mockImplementation(async function* () {
      yield 'The Gita teaches us that action without attachment is the path. What situation brings this question to you today?'
    })
    vi.mocked(groq.generateText).mockResolvedValue(
      'The Gita teaches us that action without attachment is the path. What situation brings this question to you today?'
    )

    const guardrail = await import('@/lib/guardrails/classifier')
    vi.mocked(guardrail.classifyMessage).mockResolvedValue('SAFE')

    const l3 = await import('@/lib/retrieval/structuralLookup')
    vi.mocked(l3.queryStructuralLookup).mockResolvedValue([])

    const l4 = await import('@/lib/retrieval/contextRetrieval')
    vi.mocked(l4.getContextVector).mockResolvedValue(null)
  })

  it('returns 200 with response text and sources', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'I feel paralyzed by duty' }))
    expect(res.status).toBe(200)
    const { response, sources } = await parseStream(res)
    expect(response.length).toBeGreaterThan(0)
    expect(Array.isArray(sources)).toBe(true)
  })

  it('calls parallelRetrieve with the user message', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'Who am I really' })))
    expect(parallelRetrieve).toHaveBeenCalledWith('Who am I really', expect.anything())
  })

  it('calls generateTextStream with a prompt containing retrieved verse text', async () => {
    generateTextStream.mockImplementation(async function* () { yield 'response' })
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'test question' })))
    const promptArg = (generateTextStream.mock.calls[0] as [string])[0]
    expect(promptArg).toContain('karmanye vadhikaraste')
  })

  it('includes conversation history in the prompt when provided', async () => {
    generateTextStream.mockImplementation(async function* () { yield 'response' })
    const { POST } = await import('@/app/api/chat/route')
    const history = [
      { role: 'user', content: 'prior question' },
      { role: 'assistant', content: 'prior answer' },
    ]
    await parseStream(await POST(makeRequest({ message: 'follow-up question', history })))
    const promptArg = (generateTextStream.mock.calls[0] as [string])[0]
    expect(promptArg).toContain('prior question')
    expect(promptArg).toContain('prior answer')
  })

  it('returns sources from parallelRetrieve in the response', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const { sources } = await parseStream(await POST(makeRequest({ message: 'test' })))
    expect(sources).toHaveLength(2)
    expect((sources as Array<{ verse: number }>)[0].verse).toBe(47)
  })

  it('returns 400 when message is missing', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('streams an error event when generation fails', async () => {
    const groq = await import('@/lib/llm')
    vi.mocked(groq.generateTextStream as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      throw new Error('OpenRouter timeout')
    })
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(makeRequest({ message: 'test' }))
    expect(res.status).toBe(200) // streaming route always returns 200
    const text = await res.text()
    expect(text).toContain('"t":"e"')
    expect(text).toContain('OpenRouter timeout')
  })
})
