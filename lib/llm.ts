import OpenAI from 'openai'

type ProviderConfig = {
  baseURL: string
  apiKey: () => string
  generationModel: string
  classifyModel: string
}

const PROVIDERS: Record<string, ProviderConfig> = {
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: () => process.env.GROQ_API_KEY!,
    generationModel: 'llama-3.3-70b-versatile',
    classifyModel: 'llama-3.1-8b-instant',
  },
  nvidia: {
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: () => process.env.NVIDIA_API_KEY!,
    generationModel: 'mistralai/mistral-large-3-675b-instruct-2512',
    classifyModel: 'meta/llama-3.1-8b-instruct',
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: () => process.env.DEEPSEEK_API_KEY!,
    generationModel: 'deepseek-v4-flash',
    classifyModel: 'deepseek-v4-flash',
  },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: () => process.env.GEMINI_API_KEY!,
    generationModel: 'gemini-2.0-flash',
    classifyModel: 'gemini-2.0-flash-lite',
  },
}

export const ACTIVE_PROVIDER = process.env.LLM_PROVIDER ?? 'groq'
const FALLBACK_PROVIDER = process.env.LLM_FALLBACK

const primary = PROVIDERS[ACTIVE_PROVIDER] ?? PROVIDERS.groq
const fallbackCfg = FALLBACK_PROVIDER ? PROVIDERS[FALLBACK_PROVIDER] : undefined

// Override individual models without changing provider — set in .env.local
export const GENERATION_MODEL = process.env.LLM_GENERATION_MODEL ?? primary.generationModel
export const CLASSIFY_MODEL = process.env.LLM_CLASSIFY_MODEL ?? primary.classifyModel

const DEFAULT_TIMEOUT_GEN = 15_000
const DEFAULT_TIMEOUT_CLASSIFY = 5_000

export type LLMOptions = { timeoutMs?: number }

function makeClient(cfg: ProviderConfig): OpenAI {
  return new OpenAI({ apiKey: cfg.apiKey(), baseURL: cfg.baseURL })
}

let _client: OpenAI | undefined
let _fallbackClient: OpenAI | undefined

function getClient() {
  if (!_client) _client = makeClient(primary)
  return _client
}

function getFallbackClient() {
  if (!_fallbackClient && fallbackCfg) _fallbackClient = makeClient(fallbackCfg)
  return _fallbackClient
}

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        const err = Object.assign(new Error(`LLM timeout after ${ms}ms`), { isTimeout: true })
        reject(err)
      }, ms)
    ),
  ])
}

function shouldFallback(err: unknown): boolean {
  if (err instanceof Error) {
    // Never fall back on self-imposed timeouts — the fallback would also time out
    if ((err as { isTimeout?: boolean }).isTimeout) return false
    const msg = err.message.toLowerCase()
    return (
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('quota') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('network') ||
      msg.includes('fetch failed') ||
      msg.includes('connect')
    )
  }
  return false
}

async function withFallback<T>(fn: (c: OpenAI, model: string, classifyModel: string) => Promise<T>): Promise<T> {
  try {
    return await fn(getClient(), GENERATION_MODEL, CLASSIFY_MODEL)
  } catch (err) {
    const fb = getFallbackClient()
    if (fb && fallbackCfg && shouldFallback(err)) {
      console.warn('[llm] rate limit on', ACTIVE_PROVIDER, '— falling back to', FALLBACK_PROVIDER)
      return fn(fb, fallbackCfg.generationModel, fallbackCfg.classifyModel)
    }
    throw err
  }
}

export async function generateText(prompt: string, opts: LLMOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_GEN
  return withFallback(async (c, model) => {
    const completion = await raceTimeout(
      c.chat.completions.create({ model, messages: [{ role: 'user', content: prompt }] }),
      timeoutMs
    )
    return completion.choices[0]?.message?.content ?? ''
  })
}

export async function* generateTextStream(prompt: string, opts: LLMOptions = {}): AsyncGenerator<string> {
  const messages = [{ role: 'user' as const, content: prompt }]
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_GEN
  let yieldedAny = false

  try {
    const stream = await raceTimeout(
      getClient().chat.completions.create({ model: GENERATION_MODEL, messages, stream: true }),
      timeoutMs
    )
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? ''
      if (text) { yieldedAny = true; yield text }
    }
  } catch (err) {
    const fb = getFallbackClient()
    if (!yieldedAny && fb && fallbackCfg && shouldFallback(err)) {
      console.warn('[llm] stream error on', ACTIVE_PROVIDER, '— falling back to', FALLBACK_PROVIDER)
      const fallbackStream = await fb.chat.completions.create({
        model: fallbackCfg.generationModel,
        messages,
        stream: true,
      })
      for await (const chunk of fallbackStream) {
        const text = chunk.choices[0]?.delta?.content ?? ''
        if (text) yield text
      }
    } else {
      throw err
    }
  }
}

export async function classify(prompt: string, opts: LLMOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_CLASSIFY
  return withFallback(async (c, _gen, classifyModel) => {
    const completion = await raceTimeout(
      c.chat.completions.create({ model: classifyModel, messages: [{ role: 'user', content: prompt }], max_tokens: 10 }),
      timeoutMs
    )
    return (completion.choices[0]?.message?.content ?? '').trim()
  })
}
