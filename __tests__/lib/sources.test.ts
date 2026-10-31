import { describe, it, expect } from 'vitest'
import { formatSourceRef, shortSourceRef, cleanSources } from '@/lib/sources'

describe('sources', () => {
  it('formats Gita, Bhagavatam (skandha-encoded), Yoga Sutras and Upanishads', () => {
    expect(formatSourceRef({ text_source: 'bhagavad_gita', book_chapter: 2, verse: 47 })).toBe('Bhagavad Gita 2.47')
    expect(formatSourceRef({ text_source: 'bhagavatam', book_chapter: 11002, verse: 5 })).toBe('Srimad Bhagavatam 11.2.5')
    expect(formatSourceRef({ text_source: 'yoga_sutras', book_chapter: 1, verse: 2 })).toBe('Yoga Sutras 1.2')
    expect(formatSourceRef({ text_source: 'katha_upanishad', book_chapter: 1, verse: 3 })).toBe('Katha Upanishad 1.3')
  })

  it('shortens for compact lists', () => {
    expect(shortSourceRef({ text_source: 'bhagavad_gita', book_chapter: 2, verse: 47 })).toBe('Gita 2.47')
  })

  it('drops malformed rows and duplicates', () => {
    const out = cleanSources([
      { text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'a' },
      { text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'a' },
      { nope: true },
      null,
    ])
    expect(out).toHaveLength(1)
    expect(cleanSources('x')).toEqual([])
  })
})
