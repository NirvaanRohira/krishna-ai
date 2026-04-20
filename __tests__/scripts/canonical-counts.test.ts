import { describe, test, expect } from 'vitest'
import { CANONICAL_VERSE_COUNT } from '../../scripts/lib/canonical-counts'

describe('CANONICAL_VERSE_COUNT', () => {
  test('bhagavad_gita is exactly 700', () => {
    expect(CANONICAL_VERSE_COUNT.bhagavad_gita).toBe(700)
  })

  test('is a plain object with string keys and number values', () => {
    expect(typeof CANONICAL_VERSE_COUNT).toBe('object')
    for (const [k, v] of Object.entries(CANONICAL_VERSE_COUNT)) {
      expect(typeof k).toBe('string')
      expect(typeof v).toBe('number')
    }
  })
})
