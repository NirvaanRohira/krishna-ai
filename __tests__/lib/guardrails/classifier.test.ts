import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm', () => ({
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
    const gemini = await import('@/lib/llm')
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

  it('fails to the conservative non-bypassing default (CRISIS), NOT SAFE, for garbage output', async () => {
    // Safety-critical: an unknown/garbled classification must never be treated as SAFE
    // and sent to the main LLM unguarded. It routes to a careful fixed response instead.
    classify.mockResolvedValue('UNKNOWN_GARBAGE')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('some message')).not.toBe('SAFE')
    expect(await classifyMessage('some message')).toBe('CRISIS')
  })

  it('routes a noisy "CRISIS." (trailing period) to CRISIS, not SAFE', async () => {
    classify.mockResolvedValue('CRISIS.')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('I want to end it all')).toBe('CRISIS')
  })

  it('routes markdown-fenced classifier output to the right category', async () => {
    classify.mockResolvedValue('```\nCRISIS\n```')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('I want to hurt myself')).toBe('CRISIS')
  })

  it('routes "Category: CRISIS" (labeled prefix) to CRISIS', async () => {
    classify.mockResolvedValue('Category: CRISIS')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('I have a plan to hurt myself')).toBe('CRISIS')
  })

  it('handles lowercase classifier output', async () => {
    classify.mockResolvedValue('crisis')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('lowercase crisis message')).toBe('CRISIS')
  })

  it('routes noisy MEDICAL output to MEDICAL', async () => {
    classify.mockResolvedValue('  MEDICAL  \n')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('what pills should I take?')).toBe('MEDICAL')
  })

  it('prioritizes CRISIS when output ambiguously contains multiple tokens', async () => {
    // A message about medical AND crisis must escalate to the more protective label.
    classify.mockResolvedValue('CRISIS / MEDICAL')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('mixed message')).toBe('CRISIS')
  })

  it('fails to CRISIS (never SAFE) for an empty classifier response', async () => {
    classify.mockResolvedValue('')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    expect(await classifyMessage('some message')).toBe('CRISIS')
  })

  it('passes the user message in the classification prompt', async () => {
    classify.mockResolvedValue('SAFE')
    const { classifyMessage } = await import('@/lib/guardrails/classifier')
    await classifyMessage('specific user question')
    const prompt = classify.mock.calls[0][0] as string
    expect(prompt).toContain('specific user question')
  })
})
