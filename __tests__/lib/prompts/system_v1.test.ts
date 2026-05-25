import { describe, it, expect } from 'vitest'
import { SYSTEM_PROMPT_V1 } from '@/lib/prompts/system_v1'

describe('SYSTEM_PROMPT_V1', () => {
  it('is a non-empty string longer than v0', () => {
    expect(typeof SYSTEM_PROMPT_V1).toBe('string')
    expect(SYSTEM_PROMPT_V1.length).toBeGreaterThan(500)
  })

  it('instructs the model to identify the ashrama stage for life-stage questions', () => {
    expect(SYSTEM_PROMPT_V1.toLowerCase()).toMatch(/ashrama|brahmacharya|grihastha|vanaprastha|sannyasa/)
  })

  it('instructs the model to surface specific textual prescriptions before personalising', () => {
    expect(SYSTEM_PROMPT_V1.toLowerCase()).toMatch(/prescri|specific|duties|enumerat|surface/)
  })

  it('allows citing what the texts say (not blanket no-quoting)', () => {
    // v1 distinguishes "cite textual prescriptions" from "transcribing Sanskrit script"
    expect(SYSTEM_PROMPT_V1.toLowerCase()).toMatch(/sanskrit script|iast|transliteration/)
    // must NOT have the v0 blanket "do not quote Sanskrit text verbatim" phrase
    expect(SYSTEM_PROMPT_V1).not.toContain('Do not quote Sanskrit text verbatim')
  })

  it('instructs the model to reason through life domain first', () => {
    expect(SYSTEM_PROMPT_V1.toLowerCase()).toMatch(/life domain|dharma.*karma|domain.*dharma/)
  })

  it('enforces exactly one follow-up question', () => {
    expect(SYSTEM_PROMPT_V1.toLowerCase()).toMatch(/exactly one follow.?up question/)
  })

  it('instructs the AI to acknowledge being an AI when sincerely asked', () => {
    expect(SYSTEM_PROMPT_V1.toLowerCase()).toMatch(/you are an ai|i am an ai|ai drawing/)
  })

  it('establishes the yogi persona and does not speak as Krishna the deity', () => {
    expect(SYSTEM_PROMPT_V1.toLowerCase()).toMatch(/yogi/)
    expect(SYSTEM_PROMPT_V1.toLowerCase()).toMatch(/not.*krishna|not.*deity|not.*divine/)
  })

  it('instructs grounding in multiple texts including Bhagavatam', () => {
    expect(SYSTEM_PROMPT_V1.toLowerCase()).toMatch(/bhagavatam|gita|upanishad/)
  })
})
