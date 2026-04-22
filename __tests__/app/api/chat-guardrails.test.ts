import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ startSession: vi.fn(), saveExchange: vi.fn(), endSession: vi.fn() }))
vi.mock('@/lib/retrieval/complexityRouter', () => ({ classifyComplexity: vi.fn() }))
vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/crag/loop', () => ({ runCRAG: vi.fn() }))
vi.mock('@/lib/guardrails/classifier', () => ({ classifyMessage: vi.fn() }))
vi.mock('@/lib/retrieval/structuralLookup', () => ({ queryStructuralLookup: vi.fn() }))
vi.mock('@/lib/retrieval/contextRetrieval', () => ({ getContextVector: vi.fn() }))
vi.mock('@/lib/gemini', () => ({ embedText: vi.fn(), EMBEDDING_DIMENSION: 1536 }))
vi.mock('@/lib/llm', () => ({ generateText: vi.fn(), generateTextStream: vi.fn(async function* () { yield 'response' }), classify: vi.fn() }))

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

async function parseStream(res: Response): Promise<{ response: string }> {
  const text = await res.text()
  let response = ''
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue
    try {
      const d = JSON.parse(line.slice(6))
      if (d.t === 'c') response += d.v
    } catch { /* skip */ }
  }
  return { response }
}

describe('POST /api/chat — guardrails', () => {
  let classifyMessage: ReturnType<typeof vi.fn>
  let parallelRetrieve: ReturnType<typeof vi.fn>
  let saveExchange: ReturnType<typeof vi.fn>
  let endSession: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const supabaseLib = await import('@/lib/supabase-server')
    vi.mocked(supabaseLib.createServerSupabaseClient).mockResolvedValue(makeMockSupabase() as never)

    const session = await import('@/lib/session')
    vi.mocked(session.startSession).mockResolvedValue('sess-123')
    saveExchange = vi.mocked(session.saveExchange)
    saveExchange.mockResolvedValue(undefined)
    endSession = vi.mocked(session.endSession)
    endSession.mockResolvedValue(undefined)

    const guardrail = await import('@/lib/guardrails/classifier')
    classifyMessage = vi.mocked(guardrail.classifyMessage)
    classifyMessage.mockResolvedValue('SAFE')

    const parallel = await import('@/lib/retrieval/parallelRetrieval')
    parallelRetrieve = vi.mocked(parallel.parallelRetrieve)
    parallelRetrieve.mockResolvedValue([])

    const router = await import('@/lib/retrieval/complexityRouter')
    vi.mocked(router.classifyComplexity).mockResolvedValue('SIMPLE')

    const l3 = await import('@/lib/retrieval/structuralLookup')
    vi.mocked(l3.queryStructuralLookup).mockResolvedValue([])

    const l4 = await import('@/lib/retrieval/contextRetrieval')
    vi.mocked(l4.getContextVector).mockResolvedValue(null)
  })

  it('intercepts CRISIS messages — returns fixed response without calling retrieval', async () => {
    classifyMessage.mockResolvedValue('CRISIS')
    const { POST } = await import('@/app/api/chat/route')
    const { response } = await parseStream(await POST(makeRequest({ message: 'I want to kill myself' })))
    expect(response).toContain('9152987821')
    expect(parallelRetrieve).not.toHaveBeenCalled()
  })

  it('intercepts MEDICAL messages with fixed response', async () => {
    classifyMessage.mockResolvedValue('MEDICAL')
    const { POST } = await import('@/app/api/chat/route')
    const { response } = await parseStream(await POST(makeRequest({ message: 'I have chest pains' })))
    expect(response.toLowerCase()).toContain('doctor')
    expect(parallelRetrieve).not.toHaveBeenCalled()
  })

  it('stores guardrail exchange with grounding_passed: false', async () => {
    classifyMessage.mockResolvedValue('POLITICAL')
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'political question' })))
    expect(saveExchange).toHaveBeenCalledWith(
      expect.anything(),
      'sess-123',
      'political question',
      expect.any(String),
      [],
      false,
    )
  })

  it('ends the session immediately after a CRISIS message', async () => {
    classifyMessage.mockResolvedValue('CRISIS')
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'I want to end it all' })))
    expect(endSession).toHaveBeenCalledWith(expect.anything(), 'sess-123')
  })

  it('passes SAFE messages through to retrieval normally', async () => {
    classifyMessage.mockResolvedValue('SAFE')
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'what is dharma?' })))
    expect(parallelRetrieve).toHaveBeenCalled()
  })
})
