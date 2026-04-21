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

  it('exports EMBEDDING_DIMENSION as 1536', async () => {
    // gemini-embedding-001 with outputDimensionality=1536; schema uses vector(1536)
    // 1536 is under the 2000-dim pgvector index limit; MRL preserves near-full quality
    const mod = await import('@/lib/gemini')
    expect(mod.EMBEDDING_DIMENSION).toBe(1536)
  })
})
