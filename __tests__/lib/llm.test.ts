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
    expect(mod.CLASSIFY_MODEL).toBe('openai/gpt-oss-20b')
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

  it('clears the race timeout timer after generateText resolves (no leaked timer)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'quick answer' } }],
    })
    const mod = await import('@/lib/llm')
    const result = await mod.generateText('test', { timeoutMs: 10_000 })
    expect(result).toBe('quick answer')
    // The 10s timer must be cleared once the underlying promise settles,
    // otherwise it stays live on serverless keep-alive.
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('generateTextStream rejects when the stream opens but stalls mid-generation (inactivity watchdog)', async () => {
    // Stream creation succeeds, yields one chunk, then hangs forever.
    async function* stallingStream() {
      yield { choices: [{ delta: { content: 'partial' } }] }
      await new Promise(() => {}) // never resolves — provider stalled mid-stream
    }
    mockCreate.mockResolvedValueOnce(stallingStream())
    const mod = await import('@/lib/llm')
    const gen = mod.generateTextStream('test', { streamIdleMs: 50 })
    // First chunk arrives fine
    const first = await gen.next()
    expect(first.value).toBe('partial')
    // Next pull stalls — the inactivity watchdog must reject rather than hang
    await expect(gen.next()).rejects.toThrow(/timeout|inactiv|stall|abort/i)
  }, 500)

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

describe('lib/llm — OpenRouter provider', () => {
  it('routes only to hosts that do not store or train on prompts', async () => {
    vi.resetModules()
    vi.stubEnv('LLM_PROVIDER', 'openrouter')
    vi.stubEnv('LLM_FALLBACK', '')
    vi.stubEnv('OPENROUTER_API_KEY', 'or-key')
    vi.stubEnv('LLM_GENERATION_MODEL', 'z-ai/glm-5.3')
    const mod = await import('@/lib/llm')
    await mod.generateText('hello')
    const params = mockCreate.mock.calls[0][0]
    expect(params.model).toBe('z-ai/glm-5.3')
    expect(params.provider).toEqual({ data_collection: 'deny' })
    vi.stubEnv('LLM_PROVIDER', 'groq')
    vi.stubEnv('LLM_FALLBACK', 'nvidia')
    vi.stubEnv('LLM_GENERATION_MODEL', '')
    vi.resetModules()
  })

  it('can pin specific hosts with OPENROUTER_PROVIDERS', async () => {
    vi.resetModules()
    vi.stubEnv('LLM_PROVIDER', 'openrouter')
    vi.stubEnv('LLM_FALLBACK', '')
    vi.stubEnv('OPENROUTER_API_KEY', 'or-key')
    vi.stubEnv('OPENROUTER_PROVIDERS', 'Together, Fireworks')
    const mod = await import('@/lib/llm')
    await mod.generateText('hello')
    expect(mockCreate.mock.calls[0][0].provider).toEqual({ data_collection: 'deny', order: ['Together', 'Fireworks'], allow_fallbacks: false })
    vi.stubEnv('LLM_PROVIDER', 'groq')
    vi.stubEnv('LLM_FALLBACK', 'nvidia')
    vi.stubEnv('OPENROUTER_PROVIDERS', '')
    vi.resetModules()
  })

  it('non-OpenRouter providers get no extra body fields', async () => {
    vi.resetModules()
    const mod = await import('@/lib/llm')
    await mod.generateText('hello')
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('provider')
  })
})

describe('lib/llm — resilience after model retirements', () => {
  it('Groq defaults are the current replacements, with short reasoning', async () => {
    vi.resetModules()
    vi.stubEnv('LLM_PROVIDER', 'groq')
    vi.stubEnv('LLM_FALLBACK', 'none')
    const mod = await import('@/lib/llm')
    expect(mod.GENERATION_MODEL).toBe('openai/gpt-oss-120b')
    await mod.generateText('hi')
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low' })
    vi.stubEnv('LLM_FALLBACK', 'nvidia')
    vi.resetModules()
  })

  it('falls back to Gemini automatically when the primary model is retired (404)', async () => {
    vi.resetModules()
    vi.stubEnv('LLM_PROVIDER', 'groq')
    vi.stubEnv('LLM_FALLBACK', '')
    vi.stubEnv('GEMINI_API_KEY', 'g')
    mockCreate
      .mockRejectedValueOnce(Object.assign(new Error('404 The model has been decommissioned'), { status: 404 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'from gemini' } }] })
    const mod = await import('@/lib/llm')
    expect(await mod.generateText('hi')).toBe('from gemini')
    expect(mockCreate.mock.calls[1][0].model).toBe('gemini-flash-latest')
    vi.stubEnv('LLM_FALLBACK', 'nvidia')
    vi.resetModules()
  })

  it('the safety classifier also falls back, and gives reasoning models room to answer', async () => {
    vi.resetModules()
    vi.stubEnv('LLM_FALLBACK', '')
    vi.stubEnv('GEMINI_API_KEY', 'g')
    mockCreate
      .mockRejectedValueOnce(Object.assign(new Error('model_decommissioned'), { status: 400 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'SAFE' } }] })
    const mod = await import('@/lib/llm')
    expect(await mod.classify('x')).toBe('SAFE')
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(300)
    expect(mockCreate.mock.calls[1][0].model).toBe('gemini-flash-lite-latest')
    vi.stubEnv('LLM_FALLBACK', 'nvidia')
    vi.resetModules()
  })

  it('errorCode gives short, non-sensitive categories', async () => {
    const { errorCode } = await import('@/lib/llm')
    expect(errorCode({ status: 404 })).toBe('ai_model')
    expect(errorCode({ status: 401 })).toBe('ai_auth')
    expect(errorCode({ status: 402 })).toBe('ai_quota')
    expect(errorCode({ status: 503 })).toBe('ai_unavailable')
    expect(errorCode({ isTimeout: true })).toBe('ai_timeout')
    expect(errorCode(new Error('boom'))).toBe('internal')
  })
})
