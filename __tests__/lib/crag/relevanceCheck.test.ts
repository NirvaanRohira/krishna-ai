import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm', () => ({ classify: vi.fn(), generateText: vi.fn(), generateTextStream: vi.fn() }))

const FAKE_SOURCES = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karmanye vadhikaraste...', theme_tags: ['karma'], score: 0.8 },
]

describe('checkRelevance', () => {
  let classify: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const gemini = await import('@/lib/llm')
    classify = vi.mocked(gemini.classify)
  })

  it('returns true when classify outputs "RELEVANT"', async () => {
    classify.mockResolvedValue('RELEVANT')
    const { checkRelevance } = await import('@/lib/crag/relevanceCheck')
    const result = await checkRelevance('I feel guilty about my duty', FAKE_SOURCES)
    expect(result).toBe(true)
  })

  it('returns false when classify outputs "NOT_RELEVANT"', async () => {
    classify.mockResolvedValue('NOT_RELEVANT')
    const { checkRelevance } = await import('@/lib/crag/relevanceCheck')
    const result = await checkRelevance('What is cryptocurrency?', FAKE_SOURCES)
    expect(result).toBe(false)
  })

  it('returns false when classify outputs unexpected value', async () => {
    classify.mockResolvedValue('MAYBE')
    const { checkRelevance } = await import('@/lib/crag/relevanceCheck')
    const result = await checkRelevance('some query', FAKE_SOURCES)
    expect(result).toBe(false)
  })

  it('includes the query and source text in the prompt', async () => {
    classify.mockResolvedValue('RELEVANT')
    const { checkRelevance } = await import('@/lib/crag/relevanceCheck')
    await checkRelevance('duty and fear', FAKE_SOURCES)
    const promptArg = classify.mock.calls[0][0] as string
    expect(promptArg).toContain('duty and fear')
    expect(promptArg).toContain('karmanye vadhikaraste')
  })

  it('returns false for empty sources array', async () => {
    const { checkRelevance } = await import('@/lib/crag/relevanceCheck')
    const result = await checkRelevance('any query', [])
    expect(result).toBe(false)
    expect(classify).not.toHaveBeenCalled()
  })
})
