import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

const mockCreate = vi.fn()

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: mockCreate } }
  }
  return { default: MockOpenAI }
})

beforeAll(() => {
  vi.stubEnv('LLM_PROVIDER', 'groq')
  vi.stubEnv('LLM_FALLBACK', 'nvidia')
  vi.stubEnv('GROQ_API_KEY', 'test-groq-key')
  vi.stubEnv('NVIDIA_API_KEY', 'test-nvidia-key')
  vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key')
})

beforeEach(() => {
  mockCreate.mockReset()
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: 'mocked response' }, delta: { content: '' } }],
  })
})

describe('lib/llm — classify provider isolation', () => {
  it('CLASSIFY_PROVIDER defaults to groq even when LLM_PROVIDER=deepseek', async () => {
    vi.resetModules()
    vi.stubEnv('LLM_PROVIDER', 'deepseek')
    vi.stubEnv('LLM_CLASSIFY_PROVIDER', '')
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key')
    vi.stubEnv('GROQ_API_KEY', 'test-groq-key')
    const mod = await import('@/lib/llm')
    expect(mod.CLASSIFY_PROVIDER).toBe('groq')
    expect(mod.CLASSIFY_MODEL).toBe('llama-3.1-8b-instant')
    // Restore to match beforeAll stubs so subsequent tests aren't affected
    vi.stubEnv('LLM_PROVIDER', 'groq')
    vi.stubEnv('LLM_CLASSIFY_PROVIDER', '')
    vi.resetModules()
  })

  it('CLASSIFY_PROVIDER respects LLM_CLASSIFY_PROVIDER override', async () => {
    vi.resetModules()
    vi.stubEnv('LLM_PROVIDER', 'deepseek')
    vi.stubEnv('LLM_CLASSIFY_PROVIDER', 'nvidia')
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key')
    vi.stubEnv('NVIDIA_API_KEY', 'test-nvidia-key')
    const mod = await import('@/lib/llm')
    expect(mod.CLASSIFY_PROVIDER).toBe('nvidia')
    vi.stubEnv('LLM_PROVIDER', 'groq')
    vi.stubEnv('LLM_CLASSIFY_PROVIDER', '')
    vi.resetModules()
  })
})

describe('lib/llm', () => {
  it('exports generateText function', async () => {
    const mod = await import('@/lib/llm')
    expect(typeof mod.generateText).toBe('function')
  })

  it('exports generateTextStream async generator', async () => {
    const mod = await import('@/lib/llm')
    expect(typeof mod.generateTextStream).toBe('function')
    const gen = mod.generateTextStream('test')
    expect(typeof gen[Symbol.asyncIterator]).toBe('function')
    gen.return?.(undefined)
  })

  it('exports classify function', async () => {
    const mod = await import('@/lib/llm')
    expect(typeof mod.classify).toBe('function')
  })

  it('exports GENERATION_MODEL and CLASSIFY_MODEL string constants', async () => {
    const mod = await import('@/lib/llm')
    expect(typeof mod.GENERATION_MODEL).toBe('string')
    expect(mod.GENERATION_MODEL.length).toBeGreaterThan(0)
    expect(typeof mod.CLASSIFY_MODEL).toBe('string')
    expect(mod.CLASSIFY_MODEL.length).toBeGreaterThan(0)
  })

  it('exports ACTIVE_PROVIDER string', async () => {
    const mod = await import('@/lib/llm')
    expect(typeof mod.ACTIVE_PROVIDER).toBe('string')
  })

  it('generateText rejects with a timeout error when the API call hangs beyond the generation timeout', async () => {
    // Simulate a hung API call — never resolves
    mockCreate.mockImplementationOnce(() => new Promise(() => {}))
    const mod = await import('@/lib/llm')
    await expect(mod.generateText('test', { timeoutMs: 50 })).rejects.toThrow(/timeout|abort/i)
  }, 200)

  it('classify rejects with a timeout error when the API call hangs beyond the classify timeout', async () => {
    mockCreate.mockImplementationOnce(() => new Promise(() => {}))
    const mod = await import('@/lib/llm')
    await expect(mod.classify('test', { timeoutMs: 50 })).rejects.toThrow(/timeout|abort/i)
  }, 200)

  it('generateTextStream rejects with a timeout error when the API call hangs', async () => {
    mockCreate.mockImplementationOnce(() => new Promise(() => {}))
    const mod = await import('@/lib/llm')
    const gen = mod.generateTextStream('test', { timeoutMs: 50 })
    await expect(gen.next()).rejects.toThrow(/timeout|abort/i)
  }, 200)

  it('generateTextStream falls back to secondary provider when stream iteration throws a rate-limit error', async () => {
    // First create() call returns a generator that immediately throws 429
    async function* failingStream() {
      throw new Error('429 rate limit exceeded')
      // eslint-disable-next-line no-unreachable
      yield { choices: [{ delta: { content: '' } }] }
    }
    // Second create() call (fallback client) returns good content
    async function* fallbackStream() {
      yield { choices: [{ delta: { content: 'from' } }] }
      yield { choices: [{ delta: { content: ' fallback' } }] }
    }
    mockCreate
      .mockResolvedValueOnce(failingStream())
      .mockResolvedValueOnce(fallbackStream())

    const mod = await import('@/lib/llm')
    const chunks: string[] = []
    for await (const chunk of mod.generateTextStream('test')) {
      chunks.push(chunk)
    }
    // Two create() calls means fallback fired; content comes from fallback
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(chunks.join('')).toBe('from fallback')
  })
})
