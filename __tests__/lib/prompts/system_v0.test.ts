import { describe, it, expect } from 'vitest'
import { SYSTEM_PROMPT_V0 } from '@/lib/prompts/system_v0'

describe('SYSTEM_PROMPT_V0', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT_V0).toBe('string')
    expect(SYSTEM_PROMPT_V0.length).toBeGreaterThan(100)
  })

  it('instructs the AI to end every response with exactly one follow-up question', () => {
    expect(SYSTEM_PROMPT_V0.toLowerCase()).toMatch(/follow.?up question|one question/)
  })

  it('instructs the AI not to quote Sanskrit verbatim', () => {
    expect(SYSTEM_PROMPT_V0.toLowerCase()).toMatch(/do not quote|never quote|not verbatim|own words/)
  })

  it('establishes the yogi persona', () => {
    expect(SYSTEM_PROMPT_V0.toLowerCase()).toMatch(/yogi|spiritual teacher|sage/)
  })

  it('instructs the AI to ground responses in the texts', () => {
    expect(SYSTEM_PROMPT_V0.toLowerCase()).toMatch(/gita|sacred text|scripture|grounded/)
  })

  it('instructs the AI to acknowledge being an AI when sincerely asked', () => {
    expect(SYSTEM_PROMPT_V0.toLowerCase()).toMatch(/you are an ai|i am an ai|artificial intelligence/)
  })
})
