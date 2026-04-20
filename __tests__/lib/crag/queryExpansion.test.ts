import { describe, it, expect } from 'vitest'

describe('expandQuery', () => {
  it('adds Sanskrit synonyms for karma', async () => {
    const { expandQuery } = await import('@/lib/crag/queryExpansion')
    const result = expandQuery('What is karma?')
    expect(result).toContain('karma')
    expect(result.length).toBeGreaterThan('What is karma?'.length)
  })

  it('adds Sanskrit synonyms for dharma', async () => {
    const { expandQuery } = await import('@/lib/crag/queryExpansion')
    const result = expandQuery('Tell me about dharma')
    expect(result).toContain('dharma')
    expect(result).toContain('duty')
  })

  it('adds Sanskrit synonyms for yoga', async () => {
    const { expandQuery } = await import('@/lib/crag/queryExpansion')
    const result = expandQuery('What is yoga?')
    expect(result).toContain('yoga')
  })

  it('returns original query unchanged when no known terms are present', async () => {
    const { expandQuery } = await import('@/lib/crag/queryExpansion')
    const result = expandQuery('What should I have for breakfast?')
    expect(result).toBe('What should I have for breakfast?')
  })

  it('handles multiple Sanskrit terms in one query', async () => {
    const { expandQuery } = await import('@/lib/crag/queryExpansion')
    const result = expandQuery('How do karma and dharma relate?')
    expect(result).toContain('karma')
    expect(result).toContain('dharma')
    expect(result.length).toBeGreaterThan('How do karma and dharma relate?'.length)
  })

  it('is case-insensitive when matching terms', async () => {
    const { expandQuery } = await import('@/lib/crag/queryExpansion')
    const lower = expandQuery('what is karma?')
    const upper = expandQuery('what is KARMA?')
    expect(lower.length).toBeGreaterThan('what is karma?'.length)
    expect(upper.length).toBeGreaterThan('what is KARMA?'.length)
  })
})
