import { describe, it, expect } from 'vitest'
import { getGuardrailResponse, GUARDRAIL_CATEGORIES } from '@/lib/guardrails/responses'

describe('getGuardrailResponse', () => {
  it('returns undefined for SAFE (no interception needed)', () => {
    expect(getGuardrailResponse('SAFE')).toBeUndefined()
  })

  it('returns CRISIS response containing iCall number 9152987821', () => {
    const res = getGuardrailResponse('CRISIS')
    expect(res).toBeDefined()
    expect(res).toContain('9152987821')
  })

  it('returns MEDICAL response mentioning a doctor', () => {
    const res = getGuardrailResponse('MEDICAL')
    expect(res).toBeDefined()
    expect(res!.toLowerCase()).toContain('doctor')
  })

  it('returns LEGAL_FINANCIAL response mentioning a professional', () => {
    const res = getGuardrailResponse('LEGAL_FINANCIAL')
    expect(res).toBeDefined()
    expect(res!.toLowerCase()).toContain('professional')
  })

  it('returns DIVINITY_CLAIM response mentioning AI', () => {
    const res = getGuardrailResponse('DIVINITY_CLAIM')
    expect(res).toBeDefined()
    expect(res!.toUpperCase()).toContain('AI')
  })

  it('returns POLITICAL response', () => {
    const res = getGuardrailResponse('POLITICAL')
    expect(res).toBeDefined()
    expect(res!.length).toBeGreaterThan(10)
  })

  it('exports the full list of guardrail categories', () => {
    expect(GUARDRAIL_CATEGORIES).toContain('SAFE')
    expect(GUARDRAIL_CATEGORIES).toContain('CRISIS')
    expect(GUARDRAIL_CATEGORIES).toContain('MEDICAL')
    expect(GUARDRAIL_CATEGORIES).toContain('LEGAL_FINANCIAL')
    expect(GUARDRAIL_CATEGORIES).toContain('DIVINITY_CLAIM')
    expect(GUARDRAIL_CATEGORIES).toContain('POLITICAL')
  })
})
