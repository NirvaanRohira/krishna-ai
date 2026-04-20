import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/gemini', () => ({ classify: vi.fn() }))

const FAKE_SOURCES = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karmanye vadhikaraste...', theme_tags: ['karma'], score: 0.8 },
]

describe('checkFaithfulness', () => {
  let classify: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const gemini = await import('@/lib/gemini')
    classify = vi.mocked(gemini.classify)
  })

  it('returns true when classify outputs "FAITHFUL"', async () => {
    classify.mockResolvedValue('FAITHFUL')
    const { checkFaithfulness } = await import('@/lib/crag/faithfulnessCheck')
    const result = await checkFaithfulness('Act without attachment to results', FAKE_SOURCES)
    expect(result).toBe(true)
  })

  it('returns false when classify outputs "NOT_FAITHFUL"', async () => {
    classify.mockResolvedValue('NOT_FAITHFUL')
    const { checkFaithfulness } = await import('@/lib/crag/faithfulnessCheck')
    const result = await checkFaithfulness('The Gita says to quit your job', FAKE_SOURCES)
    expect(result).toBe(false)
  })

  it('returns false when classify outputs unexpected value', async () => {
    classify.mockResolvedValue('UNSURE')
    const { checkFaithfulness } = await import('@/lib/crag/faithfulnessCheck')
    const result = await checkFaithfulness('some response', FAKE_SOURCES)
    expect(result).toBe(false)
  })

  it('includes the response text and source text in the prompt', async () => {
    classify.mockResolvedValue('FAITHFUL')
    const { checkFaithfulness } = await import('@/lib/crag/faithfulnessCheck')
    await checkFaithfulness('Act with detachment', FAKE_SOURCES)
    const promptArg = classify.mock.calls[0][0] as string
    expect(promptArg).toContain('Act with detachment')
    expect(promptArg).toContain('karmanye vadhikaraste')
  })
})
