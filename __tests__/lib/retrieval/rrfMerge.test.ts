import { describe, it, expect } from 'vitest'
import { rrfMerge } from '@/lib/retrieval/rrfMerge'

const dense = [
  { id: 1, text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'a', theme_tags: [], similarity: 0.92 },
  { id: 2, text_source: 'bhagavad_gita', book_chapter: 3, verse: 19, text: 'b', theme_tags: [], similarity: 0.85 },
  { id: 3, text_source: 'bhagavad_gita', book_chapter: 4, verse: 7, text: 'c', theme_tags: [], similarity: 0.80 },
]

const sparse = [
  { id: 2, text_source: 'bhagavad_gita', book_chapter: 3, verse: 19, text: 'b', theme_tags: [], rank: 0.9 },
  { id: 4, text_source: 'bhagavad_gita', book_chapter: 1, verse: 1, text: 'd', theme_tags: [], rank: 0.7 },
]

describe('rrfMerge', () => {
  it('returns results sorted by RRF score descending', () => {
    const results = rrfMerge(dense, sparse)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })

  it('boosts a result that appears in both lists', () => {
    const results = rrfMerge(dense, sparse)
    const id2 = results.find((r) => r.id === 2)!
    const id1 = results.find((r) => r.id === 1)!
    expect(id2.score).toBeGreaterThan(id1.score)
  })

  it('includes results that appear only in dense', () => {
    const results = rrfMerge(dense, sparse)
    expect(results.find((r) => r.id === 3)).toBeTruthy()
  })

  it('includes results that appear only in sparse', () => {
    const results = rrfMerge(dense, sparse)
    expect(results.find((r) => r.id === 4)).toBeTruthy()
  })

  it('deduplicates results that appear in both lists', () => {
    const results = rrfMerge(dense, sparse)
    const id2Matches = results.filter((r) => r.id === 2)
    expect(id2Matches).toHaveLength(1)
  })

  it('score uses k=60 by default: 1/(60+rank)', () => {
    const singleDense = [{ id: 1, text_source: 'bhagavad_gita', book_chapter: 1, verse: 1, text: 'x', theme_tags: [], similarity: 0.9 }]
    const results = rrfMerge(singleDense, [])
    const expected = 1 / (60 + 1)
    expect(results[0].score).toBeCloseTo(expected, 6)
  })

  it('respects custom k value', () => {
    const singleDense = [{ id: 1, text_source: 'bhagavad_gita', book_chapter: 1, verse: 1, text: 'x', theme_tags: [], similarity: 0.9 }]
    const results = rrfMerge(singleDense, [], 30)
    const expected = 1 / (30 + 1)
    expect(results[0].score).toBeCloseTo(expected, 6)
  })
})
