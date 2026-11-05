import { describe, it, expect } from 'vitest'
import { en, hi } from '@/lib/i18n/messages'
import { pickLang, translator, formatDate } from '@/lib/i18n'
import { parseJson } from '@/lib/daily-verse'

describe('interface language', () => {
  it('every English string has a Hindi one, and Hindi strings are actually in Hindi', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(hi[key], key).toBeTypeOf('string')
      // Placeholders survive translation.
      for (const ph of en[key].match(/\{\w+\}/g) ?? []) expect(hi[key], key).toContain(ph)
    }
    const devanagari = (Object.keys(hi) as (keyof typeof hi)[]).filter((k) => /[ऀ-ॿ]/.test(hi[k]))
    expect(devanagari.length).toBeGreaterThan(Object.keys(hi).length * 0.85)
  })

  it('a saved choice wins, then a Hindi browser, then English', () => {
    expect(pickLang('hi', 'en-IN')).toBe('hi')
    expect(pickLang('en', 'hi-IN,hi;q=0.9')).toBe('en')
    expect(pickLang(undefined, 'hi-IN,hi;q=0.9,en;q=0.8')).toBe('hi')
    expect(pickLang(undefined, 'en-IN,hi;q=0.9')).toBe('en')
    expect(pickLang('fr', null)).toBe('en')
  })

  it('fills placeholders and formats dates per language', () => {
    expect(translator('hi')('chat.plan_until', { plan: 'प्लस', date: 'x' })).toBe('प्लस प्लान, x तक')
    expect(translator('en')('book.chapter', { n: 3 })).toBe('Adhyāya 3')
    expect(formatDate('hi', '2026-11-02T00:00:00Z')).toMatch(/नवंबर/)
  })

  it('the daily verse keeps its English page even when the Hindi one is missing or broken', () => {
    const base = { title: 'Work, not fruit', moment: 'm', teaching: 't', life: 'l', practice: 'p' }
    expect(parseJson(JSON.stringify(base))?.hi).toBeNull()
    expect(parseJson(JSON.stringify({ ...base, hi: { title: 'only' } }))?.hi).toBeNull()
    const hiPage = { title: 'कर्म, फल नहीं', moment: 'प्र', teaching: 'शि', life: 'जी', practice: 'अ' }
    expect(parseJson(JSON.stringify({ ...base, hi: hiPage }))?.hi).toEqual(hiPage)
  })
})
