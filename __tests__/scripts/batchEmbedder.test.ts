import { describe, it, expect } from 'vitest'
import { buildInlinedRequests, extractEmbeddings } from '../../scripts/lib/batchEmbedder'

describe('buildInlinedRequests', () => {
  it('maps each row to a request containing its text', () => {
    const rows = [
      { id: 1, text: 'dharma text' },
      { id: 2, text: 'karma text' },
    ]
    const requests = buildInlinedRequests(rows)
    expect(requests[0].content.parts[0].text).toBe('dharma text')
    expect(requests[1].content.parts[0].text).toBe('karma text')
  })

  it('sets outputDimensionality to 1536 on every request', () => {
    const rows = [{ id: 1, text: 'test verse' }]
    const requests = buildInlinedRequests(rows)
    expect(requests[0].outputDimensionality).toBe(1536)
  })

  it('preserves order so responses zip back to rows correctly', () => {
    const rows = [
      { id: 5, text: 'a' },
      { id: 3, text: 'b' },
      { id: 9, text: 'c' },
    ]
    const requests = buildInlinedRequests(rows)
    expect(requests).toHaveLength(3)
    expect(requests[0].content.parts[0].text).toBe('a')
    expect(requests[1].content.parts[0].text).toBe('b')
    expect(requests[2].content.parts[0].text).toBe('c')
  })

  it('returns empty array for empty input', () => {
    expect(buildInlinedRequests([])).toEqual([])
  })
})

describe('extractEmbeddings', () => {
  it('pairs each response embedding with the corresponding row id', () => {
    const rows = [{ id: 10 }, { id: 20 }]
    const responses = [
      { embedding: { values: [0.1, 0.2, 0.3] } },
      { embedding: { values: [0.4, 0.5, 0.6] } },
    ]
    const result = extractEmbeddings(responses, rows)
    expect(result[0]).toEqual({ id: 10, embedding: [0.1, 0.2, 0.3] })
    expect(result[1]).toEqual({ id: 20, embedding: [0.4, 0.5, 0.6] })
  })

  it('throws if response count does not match row count', () => {
    const rows = [{ id: 1 }, { id: 2 }]
    const responses = [{ embedding: { values: [0.1] } }]
    expect(() => extractEmbeddings(responses, rows)).toThrow(
      'response count mismatch'
    )
  })

  it('returns empty array when both inputs are empty', () => {
    expect(extractEmbeddings([], [])).toEqual([])
  })
})
