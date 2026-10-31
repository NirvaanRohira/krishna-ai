import OpenAI from 'openai'

type ProviderConfig = {
  baseURL: string
  apiKey: () => string
  generationModel: string
  classifyModel: string
  headers?: Record<string, string>
  /** Extra request-body fields this provider understands (e.g. OpenRouter routing). */
  extraBody?: () => Record<string, unknown>
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
  // One key, many open models (Kimi, GLM, Qwen, DeepSeek, Llama, gpt-oss…). Model slugs:
  // https://openrouter.ai/models — pick with LLM_GENERATION_MODEL, compare with
  // `npm run eval:models`.
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: () => process.env.OPENROUTER_API_KEY!,
    generationModel: 'deepseek/deepseek-v4-flash',
    classifyModel: 'meta-llama/llama-3.1-8b-instruct',
    headers: { 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://kanha.app', 'X-Title': 'Kanha' },
    // Conversations are sensitive: only route to hosts that neither store nor train on
    // prompts. Optionally pin hosts (e.g. US/EU/India) with OPENROUTER_PROVIDERS=a,b.
    extraBody: () => ({
      provider: {
        data_collection: 'deny',
        ...(process.env.OPENROUTER_PROVIDERS
          ? { order: process.env.OPENROUTER_PROVIDERS.split(',').map((x) => x.trim()), allow_fallbacks: false }
          : {}),
      },
    }),
  },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: () => process.env.GEMINI_API_KEY!,
    // Override with LLM_GENERATION_MODEL / LLM_CLASSIFY_MODEL when newer models ship.
    generationModel: 'gemini-2.5-flash',
    classifyModel: 'gemini-2.5-flash-lite',
  },
}

export const ACTIVE_PROVIDER = process.env.LLM_PROVIDER ?? 'groq'
const FALLBACK_PROVIDER = process.env.LLM_FALLBACK

const primary = PROVIDERS[ACTIVE_PROVIDER] ?? PROVIDERS.groq
const fallbackCfg = FALLBACK_PROVIDER ? PROVIDERS[FALLBACK_PROVIDER] : undefined

export const GENERATION_MODEL = process.env.LLM_GENERATION_MODEL ?? primary.generationModel

// Classify is always pinned to Groq by default — fast 8B model, ~150ms regardless of generation provider.
// Override both provider and model via LLM_CLASSIFY_PROVIDER / LLM_CLASSIFY_MODEL in .env.local.
export const CLASSIFY_PROVIDER = process.env.LLM_CLASSIFY_PROVIDER || 'groq'
const classifyProviderCfg = PROVIDERS[CLASSIFY_PROVIDER] ?? PROVIDERS.groq
export const CLASSIFY_MODEL = process.env.LLM_CLASSIFY_MODEL ?? classifyProviderCfg.classifyModel

const DEFAULT_TIMEOUT_GEN = 15_000
const DEFAULT_TIMEOUT_CLASSIFY = 5_000
const DEFAULT_STREAM_IDLE = 20_000

export type LLMOptions = { timeoutMs?: number; streamIdleMs?: number }

function makeClient(cfg: ProviderConfig): OpenAI {
  return new OpenAI({ apiKey: cfg.apiKey(), baseURL: cfg.baseURL, defaultHeaders: cfg.headers })
}

/** Provider-specific body fields, typed loosely because they extend the OpenAI schema. */
function extra(cfg: ProviderConfig | undefined): Record<string, unknown> {
  return cfg?.extraBody?.() ?? {}
}

let _client: OpenAI | undefined
let _fallbackClient: OpenAI | undefined
let _classifyClient: OpenAI | undefined

function getClient() {
  if (!_client) _client = makeClient(primary)
  return _client
}

function getFallbackClient() {
  if (!_fallbackClient && fallbackCfg) _fallbackClient = makeClient(fallbackCfg)
  return _fallbackClient
}

function getClassifyClient() {
  if (!_classifyClient) _classifyClient = makeClient(classifyProviderCfg)
  return _classifyClient
}

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  // Capture the timer id and clear it once the race settles. Without this the timeout
  // stays live (up to `ms`) after the underlying promise wins, keeping a serverless
  // instance awake and leaking a timer per call.
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = Object.assign(new Error(`LLM timeout after ${ms}ms`), { isTimeout: true })
      reject(err)
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Wrap a chunk stream with an inactivity watchdog. Only stream CREATION is guarded by
 * raceTimeout; a provider that opens the stream then stalls mid-generation would hang
 * indefinitely. This races each pull against an idle timer and throws a timeout error
 * if no chunk arrives within `idleMs`.
 */
async function* withStreamIdleTimeout<T>(
  stream: AsyncIterable<T>,
  idleMs: number
): AsyncGenerator<T> {
  const iterator = stream[Symbol.asyncIterator]()
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const idle = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = Object.assign(
            new Error(`LLM stream inactivity timeout after ${idleMs}ms`),
            { isTimeout: true }
          )
          reject(err)
        }, idleMs)
      })
      let result: IteratorResult<T>
      try {
        result = await Promise.race([iterator.next(), idle])
      } finally {
        if (timer) clearTimeout(timer)
      }
      if (result.done) return
      yield result.value
    }
  } finally {
    // Best-effort: release the underlying stream. Do NOT await — if the provider stalled
    // mid-chunk, its pending next() blocks return() from ever settling, which would hang
    // the request forever instead of surfacing the idle-timeout error.
    iterator.return?.()?.catch(() => {})
  }
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

async function withFallback<T>(fn: (c: OpenAI, model: string, cfg: ProviderConfig) => Promise<T>): Promise<T> {
  try {
    return await fn(getClient(), GENERATION_MODEL, primary)
  } catch (err) {
    const fb = getFallbackClient()
    if (fb && fallbackCfg && shouldFallback(err)) {
      console.warn('[llm] rate limit on', ACTIVE_PROVIDER, '— falling back to', FALLBACK_PROVIDER)
      return fn(fb, fallbackCfg.generationModel, fallbackCfg)
    }
    throw err
  }
}

export async function generateText(prompt: string, opts: LLMOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_GEN
  return withFallback(async (c, model, cfg) => {
    const completion = await raceTimeout(
      c.chat.completions.create({ model, messages: [{ role: 'user', content: prompt }], ...extra(cfg) } as OpenAI.ChatCompletionCreateParamsNonStreaming),
      timeoutMs
    )
    return completion.choices[0]?.message?.content ?? ''
  })
}

export async function* generateTextStream(prompt: string, opts: LLMOptions = {}): AsyncGenerator<string> {
  const messages = [{ role: 'user' as const, content: prompt }]
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_GEN
  const idleMs = opts.streamIdleMs ?? DEFAULT_STREAM_IDLE
  let yieldedAny = false

  try {
    const stream = await raceTimeout(
      getClient().chat.completions.create({ model: GENERATION_MODEL, messages, stream: true, ...extra(primary) } as OpenAI.ChatCompletionCreateParamsStreaming),
      timeoutMs
    )
    // Watchdog the consumption too: a stream that opens then stalls mid-generation
    // would otherwise hang forever. The idle-timeout error is tagged isTimeout, so
    // shouldFallback() returns false for it — a stall surfaces rather than re-racing.
    for await (const chunk of withStreamIdleTimeout(stream, idleMs)) {
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
        ...extra(fallbackCfg),
      } as OpenAI.ChatCompletionCreateParamsStreaming)
      for await (const chunk of withStreamIdleTimeout(fallbackStream, idleMs)) {
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
  const completion = await raceTimeout(
    getClassifyClient().chat.completions.create({
      model: CLASSIFY_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      ...extra(classifyProviderCfg),
    } as OpenAI.ChatCompletionCreateParamsNonStreaming),
    timeoutMs
  )
  return (completion.choices[0]?.message?.content ?? '').trim()
}
