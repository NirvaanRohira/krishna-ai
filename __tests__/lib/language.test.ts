import { describe, it, expect } from 'vitest'
import { detectLanguage, ttsLocale } from '@/lib/language'

describe('detectLanguage', () => {
  it.each([
    ['What does the Gita say about duty?', 'en'],
    ['मुझे अपने कर्तव्य के बारे में बताइए', 'hi'],
    ['Mujhe samajh nahi aa raha ki main kya karu, dil bahut pareshan hai', 'hinglish'],
    ['எனக்கு மன அமைதி வேண்டும்', 'ta'],
    ['నాకు శాంతి కావాలి', 'te'],
    ['আমি খুব চিন্তিত', 'bn'],
    ['મને શાંતિ જોઈએ છે', 'gu'],
  ])('%s → %s', (text, lang) => {
    expect(detectLanguage(text)).toBe(lang)
  })

  it('treats Sanskrit terms inside English as English', () => {
    expect(detectLanguage('What is dharma and karma in the Gita?')).toBe('en')
  })
})

describe('ttsLocale', () => {
  it('maps languages to Indian locales', () => {
    expect(ttsLocale('hi')).toBe('hi-IN')
    expect(ttsLocale('hinglish')).toBe('en-IN')
    expect(ttsLocale('en')).toBe('en-IN')
  })
})
