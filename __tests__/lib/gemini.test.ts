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

  it('exports EMBEDDING_DIMENSION as 768', async () => {
    // Embedding dimension must be 768 (text-embedding-004) not 1536 (OpenAI)
    // This is a critical constant — schema migrations depend on it
    const mod = await import('@/lib/gemini')
    expect(mod.EMBEDDING_DIMENSION).toBe(768)
  })
})
