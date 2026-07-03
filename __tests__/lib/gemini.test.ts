import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

const mockEmbedContent = vi.fn()

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { embedContent: mockEmbedContent }
    }
  },
}))

beforeAll(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key-placeholder')
})

beforeEach(() => {
  mockEmbedContent.mockReset()
  mockEmbedContent.mockResolvedValue({ embedding: { values: new Array(1536).fill(0.1) } })
})

describe('lib/gemini', () => {
  it('exports an embedText function', async () => {
    const mod = await import('@/lib/gemini')
    expect(typeof mod.embedText).toBe('function')
  })

  it('embedText returns the embedding values on success', async () => {
    const mod = await import('@/lib/gemini')
    const vec = await mod.embedText('karma')
    expect(Array.isArray(vec)).toBe(true)
    expect(vec.length).toBe(1536)
  })

  it('embedText rejects with a clear timeout error when the embed call hangs', async () => {
    // embedText is the only network call previously lacking a timeout — a hung
    // embedding must not hang the request. It must reject so callers can degrade.
    mockEmbedContent.mockImplementationOnce(() => new Promise(() => {}))
    const mod = await import('@/lib/gemini')
    await expect(mod.embedText('karma', { timeoutMs: 50 })).rejects.toThrow(/timeout|embed/i)
  }, 300)

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
