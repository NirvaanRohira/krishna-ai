import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/retrieval/parallelRetrieval', () => ({ parallelRetrieve: vi.fn() }))
vi.mock('@/lib/llm', () => ({ generateText: vi.fn(), generateTextStream: vi.fn(), classify: vi.fn() }))
vi.mock('@/lib/crag/relevanceCheck', () => ({ checkRelevance: vi.fn() }))
vi.mock('@/lib/crag/faithfulnessCheck', () => ({ checkFaithfulness: vi.fn() }))

const FAKE_SOURCES = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karmanye vadhikaraste...', theme_tags: ['karma'], score: 0.8 },
]

describe('runCRAG', () => {
  let parallelRetrieve: ReturnType<typeof vi.fn>
  let generateText: ReturnType<typeof vi.fn>
  let generateTextStream: ReturnType<typeof vi.fn>
  let checkRelevance: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const parallel = await import('@/lib/retrieval/parallelRetrieval')
    parallelRetrieve = vi.mocked(parallel.parallelRetrieve)
    parallelRetrieve.mockResolvedValue(FAKE_SOURCES)

    const llm = await import('@/lib/llm')
    generateText = vi.mocked(llm.generateText)
    generateText.mockResolvedValue('The Gita teaches us...')
    generateTextStream = vi.mocked(llm.generateTextStream as ReturnType<typeof vi.fn>)
    generateTextStream.mockImplementation(async function* () { yield 'The '; yield 'Gita '; yield 'teaches.' })

    const rel = await import('@/lib/crag/relevanceCheck')
    checkRelevance = vi.mocked(rel.checkRelevance)
    checkRelevance.mockResolvedValue(true)
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

  it('soft-falls back to generation from best sources when relevance fails all retries', async () => {
    // Sources exist but relevance check always returns false
    checkRelevance.mockResolvedValue(false)
    const { runCRAG } = await import('@/lib/crag/loop')
    const result = await runCRAG('I feel lost in my job', [], {})
    // Should NOT give up — should generate from best sources found
    expect(generateText).toHaveBeenCalled()
    expect(result.response).toBe('The Gita teaches us...')
    expect(result.sources.length).toBeGreaterThan(0)
  })

  it('returns hard give-up only when retrieval returns empty sources', async () => {
    checkRelevance.mockResolvedValue(false)
    parallelRetrieve.mockResolvedValue([]) // truly no sources
    const { runCRAG } = await import('@/lib/crag/loop')
    const result = await runCRAG('what is cryptocurrency?', [], {})
    expect(result.response).toContain('cannot find')
    expect(generateText).not.toHaveBeenCalled()
  })

  it('includes conversation history in generation prompt', async () => {
    const { runCRAG } = await import('@/lib/crag/loop')
    const history = [{ role: 'user' as const, content: 'previous question' }]
    await runCRAG('follow up', history, {})
    const promptArg = generateText.mock.calls[0][0] as string
    expect(promptArg).toContain('previous question')
  })

  it('calls onChunk with each chunk when callback provided', async () => {
    const { runCRAG } = await import('@/lib/crag/loop')
    const chunks: string[] = []
    await runCRAG('I feel lost in my duty', [], {
      onChunk: async (c) => { chunks.push(c) }
    })
    expect(chunks).toEqual(['The ', 'Gita ', 'teaches.'])
  })

  it('uses generateTextStream (not generateText) when onChunk provided', async () => {
    const { runCRAG } = await import('@/lib/crag/loop')
    await runCRAG('What is dharma?', [], {
      onChunk: async () => {}
    })
    expect(generateTextStream).toHaveBeenCalled()
    expect(generateText).not.toHaveBeenCalled()
  })

  it('does not call onChunk on hard give-up path', async () => {
    checkRelevance.mockResolvedValue(false)
    parallelRetrieve.mockResolvedValue([])
    const { runCRAG } = await import('@/lib/crag/loop')
    const chunks: string[] = []
    const result = await runCRAG('what is cryptocurrency?', [], {
      onChunk: async (c) => { chunks.push(c) }
    })
    expect(chunks).toHaveLength(0)
    expect(result.response).toContain('cannot find')
  })

  it('calls onChunk in soft-fallback path when relevance fails but sources exist', async () => {
    checkRelevance.mockResolvedValue(false)
    const { runCRAG } = await import('@/lib/crag/loop')
    const chunks: string[] = []
    await runCRAG('I feel lost in my job', [], {
      onChunk: async (c) => { chunks.push(c) }
    })
    expect(chunks.length).toBeGreaterThan(0)
  })
})
