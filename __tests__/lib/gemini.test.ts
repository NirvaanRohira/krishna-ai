import { describe, it, expect, beforeAll, vi } from 'vitest'

beforeAll(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key-placeholder')
})

describe('lib/gemini', () => {
  it('exports a generateText function', async () => {
    // RED: fails because lib/gemini.ts does not exist yet
    const mod = await import('@/lib/gemini')
    expect(typeof mod.generateText).toBe('function')
  })

  it('exports a classify function', async () => {
    const mod = await import('@/lib/gemini')
    expect(typeof mod.classify).toBe('function')
  })

  it('exports an embedText function', async () => {
    const mod = await import('@/lib/gemini')
    expect(typeof mod.embedText).toBe('function')
  })

  it('exports EMBEDDING_DIMENSION as 3072', async () => {
    // gemini-embedding-001 produces 3072-dim vectors (text-embedding-004 no longer exists)
    // Critical: schema migrations use vector(3072)
    const mod = await import('@/lib/gemini')
    expect(mod.EMBEDDING_DIMENSION).toBe(3072)
  })
})
