import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/gemini', () => ({ classify: vi.fn() }))

describe('classifyComplexity', () => {
  let classify: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const gemini = await import('@/lib/gemini')
    classify = vi.mocked(gemini.classify)
  })

  it('returns SIMPLE when classify outputs "SIMPLE"', async () => {
    classify.mockResolvedValue('SIMPLE')
    const { classifyComplexity } = await import('@/lib/retrieval/complexityRouter')
    const result = await classifyComplexity('Who is Arjuna?')
    expect(result).toBe('SIMPLE')
  })

  it('returns COMPLEX when classify outputs "COMPLEX"', async () => {
    classify.mockResolvedValue('COMPLEX')
    const { classifyComplexity } = await import('@/lib/retrieval/complexityRouter')
    const result = await classifyComplexity('I feel paralyzed by fear of acting against my family')
    expect(result).toBe('COMPLEX')
  })

  it('returns SIMPLE when classify returns mixed-case "simple"', async () => {
    classify.mockResolvedValue('simple')
    const { classifyComplexity } = await import('@/lib/retrieval/complexityRouter')
    const result = await classifyComplexity('What is dharma?')
    expect(result).toBe('SIMPLE')
  })

  it('defaults to COMPLEX when classify returns an unexpected value', async () => {
    classify.mockResolvedValue('UNKNOWN_VALUE')
    const { classifyComplexity } = await import('@/lib/retrieval/complexityRouter')
    const result = await classifyComplexity('some query')
    expect(result).toBe('COMPLEX')
  })

  it('passes the query in a prompt to classify', async () => {
    classify.mockResolvedValue('SIMPLE')
    const { classifyComplexity } = await import('@/lib/retrieval/complexityRouter')
    await classifyComplexity('What is yoga?')
    const promptArg = classify.mock.calls[0][0] as string
    expect(promptArg).toContain('What is yoga?')
  })
})
