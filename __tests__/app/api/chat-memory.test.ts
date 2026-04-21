import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ startSession: vi.fn(), saveExchange: vi.fn() }))
vi.mock('@/lib/retrieval/complexityRouter', () => ({ classifyComplexity: vi.fn() }))
vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/crag/loop', () => ({ runCRAG: vi.fn() }))
vi.mock('@/lib/guardrails/classifier', () => ({ classifyMessage: vi.fn() }))
vi.mock('@/lib/memory/profileInjector', () => ({ loadAndInjectProfile: vi.fn() }))
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
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { turn_count: 0 }, error: null }),
  }
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

describe('POST /api/chat — memory injection', () => {
  let loadAndInjectProfile: ReturnType<typeof vi.fn>

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

    const gemini = await import('@/lib/gemini')
    vi.mocked(gemini.generateText).mockResolvedValue('The Gita teaches...')

    const guardrail = await import('@/lib/guardrails/classifier')
    vi.mocked(guardrail.classifyMessage).mockResolvedValue('SAFE')

    const memory = await import('@/lib/memory/profileInjector')
    loadAndInjectProfile = vi.mocked(memory.loadAndInjectProfile)
    loadAndInjectProfile.mockResolvedValue('ENRICHED_SYSTEM_PROMPT')
  })

  it('calls loadAndInjectProfile with the authenticated user id', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await parseStream(await POST(makeRequest({ message: 'What is dharma?' })))
    expect(loadAndInjectProfile).toHaveBeenCalledWith('user-123', expect.anything())
  })

  it('uses the enriched system prompt from profileInjector in generation', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const gemini = await import('@/lib/gemini')
    await parseStream(await POST(makeRequest({ message: 'What is dharma?' })))
    const promptArg = vi.mocked(gemini.generateText).mock.calls[0][0] as string
    expect(promptArg).toContain('ENRICHED_SYSTEM_PROMPT')
  })
})
