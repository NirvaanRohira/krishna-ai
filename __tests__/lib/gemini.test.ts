import { describe, it, expect, beforeAll, vi } from 'vitest'

beforeAll(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key-placeholder')
})

describe('lib/gemini', () => {
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

  it('does not export generateText (moved to lib/groq)', async () => {
    const mod = await import('@/lib/gemini')
    expect((mod as Record<string, unknown>).generateText).toBeUndefined()
  })

  it('does not export classify (moved to lib/groq)', async () => {
    const mod = await import('@/lib/gemini')
    expect((mod as Record<string, unknown>).classify).toBeUndefined()
  })
})
