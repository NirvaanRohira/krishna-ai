import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm', () => ({ generateText: vi.fn() }))

const FAKE_TRANSCRIPT = `user: I feel lost in my career. I have always wanted to paint but my parents want me to be an engineer.
assistant: The Gita speaks to exactly this tension between svadharma and family obligation...`

const FAKE_LLM_OUTPUT = JSON.stringify({
  life_context: 'Torn between artistic calling and family expectation',
  recurring_themes: ['duty', 'attachment to outcome'],
  primary_attachments: ['parental approval', 'financial security'],
  current_life_stage: 'brahmacharya',
  previous_guidance_entry: {
    topic: 'svadharma vs family obligation',
    texts_cited: ['Gita 3.35', 'Gita 18.47'],
    summary: 'Discussed following one\'s own nature over another\'s duty, even imperfectly',
  },
})

describe('extractSessionProfile', () => {
  let generateText: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const gemini = await import('@/lib/llm')
    generateText = vi.mocked(gemini.generateText)
    generateText.mockResolvedValue(FAKE_LLM_OUTPUT)
  })

  it('calls generateText with the transcript', async () => {
    const { extractSessionProfile } = await import('@/lib/memory/sessionExtractor')
    await extractSessionProfile(FAKE_TRANSCRIPT)
    expect(generateText).toHaveBeenCalledOnce()
    const prompt = generateText.mock.calls[0][0] as string
    expect(prompt).toContain(FAKE_TRANSCRIPT)
  })

  it('returns life_context from LLM output', async () => {
    const { extractSessionProfile } = await import('@/lib/memory/sessionExtractor')
    const result = await extractSessionProfile(FAKE_TRANSCRIPT)
    expect(result.life_context).toBe('Torn between artistic calling and family expectation')
  })

  it('returns primary_attachments from LLM output', async () => {
    const { extractSessionProfile } = await import('@/lib/memory/sessionExtractor')
    const result = await extractSessionProfile(FAKE_TRANSCRIPT)
    expect(result.primary_attachments).toContain('parental approval')
  })

  it('returns recurring_themes from LLM output', async () => {
    const { extractSessionProfile } = await import('@/lib/memory/sessionExtractor')
    const result = await extractSessionProfile(FAKE_TRANSCRIPT)
    expect(result.recurring_themes).toContain('duty')
  })

  it('returns current_life_stage from LLM output', async () => {
    const { extractSessionProfile } = await import('@/lib/memory/sessionExtractor')
    const result = await extractSessionProfile(FAKE_TRANSCRIPT)
    expect(result.current_life_stage).toBe('brahmacharya')
  })

  it('returns previous_guidance_entry with topic and texts_cited', async () => {
    const { extractSessionProfile } = await import('@/lib/memory/sessionExtractor')
    const result = await extractSessionProfile(FAKE_TRANSCRIPT)
    expect(result.previous_guidance_entry?.topic).toContain('svadharma')
    expect(result.previous_guidance_entry?.texts_cited).toContain('Gita 3.35')
  })

  it('returns empty object when LLM output is not valid JSON', async () => {
    generateText.mockResolvedValue('I cannot parse this session.')
    const { extractSessionProfile } = await import('@/lib/memory/sessionExtractor')
    const result = await extractSessionProfile(FAKE_TRANSCRIPT)
    expect(result).toEqual({})
  })
})
