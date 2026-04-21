import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/gemini', () => ({
  classify: vi.fn(),
  generateText: vi.fn(),
  generateTextStream: vi.fn(),
  embedText: vi.fn(),
  EMBEDDING_DIMENSION: 1536,
}))

describe('classifyMessage', () => {
  let classify: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const gemini = await import('@/lib/gemini')
    classify = vi.mocked(gemini.classify)
  })

  it('returns SAFE for normal spiritual questions', async () => {
    classify.mockResolvedValue('SAFE')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('What does the Gita say about duty?')).toBe('SAFE')
  })

  it('returns CRISIS for self-harm messages', async () => {
    classify.mockResolvedValue('CRISIS')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('I want to kill myself')).toBe('CRISIS')
  })

  it('returns MEDICAL for health-related questions', async () => {
    classify.mockResolvedValue('MEDICAL')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('I have chest pains, what does the Gita say?')).toBe('MEDICAL')
  })

  it('returns LEGAL_FINANCIAL for legal questions', async () => {
    classify.mockResolvedValue('LEGAL_FINANCIAL')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('Should I file a lawsuit against my brother?')).toBe('LEGAL_FINANCIAL')
  })

  it('returns DIVINITY_CLAIM when user asks if AI is God', async () => {
    classify.mockResolvedValue('DIVINITY_CLAIM')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('Are you actually the real God Krishna?')).toBe('DIVINITY_CLAIM')
  })

  it('returns POLITICAL for political questions', async () => {
    classify.mockResolvedValue('POLITICAL')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('What should India do about Pakistan?')).toBe('POLITICAL')
  })

  it('defaults to SAFE for unexpected classify output (fail-open)', async () => {
    classify.mockResolvedValue('UNKNOWN_GARBAGE')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('some message')).toBe('SAFE')
  })

  it('passes the user message in the classification prompt', async () => {
    classify.mockResolvedValue('SAFE')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    await classifyMessage('specific user question')
    const prompt = classify.mock.calls[0][0] as string
    expect(prompt).toContain('specific user question')
  })
})
