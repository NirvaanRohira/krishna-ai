import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('openai', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'mocked response' }, delta: { content: '' } }],
  })
  class MockOpenAI {
    chat = { completions: { create: mockCreate } }
  }
  return { default: MockOpenAI }
})

beforeAll(() => {
  vi.stubEnv('LLM_PROVIDER', 'groq')
  vi.stubEnv('GROQ_API_KEY', 'test-groq-key')
  vi.stubEnv('NVIDIA_API_KEY', 'test-nvidia-key')
  vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key')
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
})
