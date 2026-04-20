import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/gemini', () => ({ generateText: vi.fn(), classify: vi.fn() }))
vi.mock('@/lib/crag/relevanceCheck', () => ({ checkRelevance: vi.fn() }))
vi.mock('@/lib/crag/faithfulnessCheck', () => ({ checkFaithfulness: vi.fn() }))

const FAKE_SOURCES = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karmanye vadhikaraste...', theme_tags: ['karma'], score: 0.8 },
]

describe('runCRAG', () => {
  let parallelRetrieve: ReturnType<typeof vi.fn>
  let generateText: ReturnType<typeof vi.fn>
  let checkRelevance: ReturnType<typeof vi.fn>
  let checkFaithfulness: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const parallel = await import('@/lib/retrieval/parallelRetrieval')
    parallelRetrieve = vi.mocked(parallel.parallelRetrieve)
    parallelRetrieve.mockResolvedValue(FAKE_SOURCES)

    const gemini = await import('@/lib/gemini')
    generateText = vi.mocked(gemini.generateText)
    generateText.mockResolvedValue('The Gita teaches us...')

    const rel = await import('@/lib/crag/relevanceCheck')
    checkRelevance = vi.mocked(rel.checkRelevance)
    checkRelevance.mockResolvedValue(true)

    const faith = await import('@/lib/crag/faithfulnessCheck')
    checkFaithfulness = vi.mocked(faith.checkFaithfulness)
    checkFaithfulness.mockResolvedValue(true)
  })

  it('returns generated response and sources on happy path', async () => {
    const { runCRAG } = await import('@/lib/crag/loop')
    const result = await runCRAG('I feel lost in my duty', [], {})
    expect(result.response).toBe('The Gita teaches us...')
    expect(result.sources).toEqual(FAKE_SOURCES)
  })

  it('calls parallelRetrieve with the user query', async () => {
    const { runCRAG } = await import('@/lib/crag/loop')
    await runCRAG('Who am I?', [], {})
    expect(parallelRetrieve).toHaveBeenCalledWith('Who am I?', expect.anything())
  })

  it('retries with expanded query when relevance check fails on first attempt', async () => {
    checkRelevance.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { runCRAG } = await import('@/lib/crag/loop')
    await runCRAG('karma and duty', [], {})
    expect(parallelRetrieve).toHaveBeenCalledTimes(2)
  })

  it('retries with expanded query when faithfulness check fails on first attempt', async () => {
    checkFaithfulness.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { runCRAG } = await import('@/lib/crag/loop')
    await runCRAG('dharma path', [], {})
    expect(generateText).toHaveBeenCalledTimes(2)
  })

  it('returns give-up message after 2 failed relevance retries', async () => {
    checkRelevance.mockResolvedValue(false)
    const { runCRAG } = await import('@/lib/crag/loop')
    const result = await runCRAG('what is cryptocurrency?', [], {})
    expect(result.response).toContain('cannot find')
    expect(parallelRetrieve).toHaveBeenCalledTimes(3)
  })

  it('returns give-up message after 2 failed faithfulness retries', async () => {
    checkFaithfulness.mockResolvedValue(false)
    const { runCRAG } = await import('@/lib/crag/loop')
    const result = await runCRAG('some query', [], {})
    expect(result.response).toContain('cannot find')
    expect(generateText).toHaveBeenCalledTimes(3)
  })

  it('includes conversation history in generation prompt', async () => {
    const { runCRAG } = await import('@/lib/crag/loop')
    const history = [{ role: 'user' as const, content: 'previous question' }]
    await runCRAG('follow up', history, {})
    const promptArg = generateText.mock.calls[0][0] as string
    expect(promptArg).toContain('previous question')
  })
})
