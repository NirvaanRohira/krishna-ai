import OpenAI from 'openai'

type ProviderConfig = {
  baseURL: string
  apiKey: () => string
  generationModel: string
  classifyModel: string
  headers?: Record<string, string>
  /** Extra request-body fields this provider understands (e.g. OpenRouter routing). */
  extraBody?: (model: string) => Record<string, unknown>
}

// Model names are retired regularly (Groq retired llama-3.3-70b-versatile and
// llama-3.1-8b-instant on 16 Aug 2026 and production chat broke). Prefer "-latest" aliases
// where a provider offers them, keep every name overridable by env, and fall back to a
// second provider automatically (see FALLBACK_PROVIDER).

const PROVIDERS: Record<string, ProviderConfig> = {
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: () => process.env.GROQ_API_KEY!,
    // Groq's recommended replacements for the retired Llama 3.x models.
    generationModel: 'openai/gpt-oss-120b',
    classifyModel: 'openai/gpt-oss-20b',
    // gpt-oss models reason before answering; keep that short so replies stay fast.
    extraBody: (model) => (model.startsWith('openai/gpt-oss') ? { reasoning_effort: process.env.LLM_REASONING_EFFORT || 'low' } : {}),
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
    // "-latest" aliases always point at a current model, so a retirement can't break us.
    generationModel: 'gemini-flash-latest',
    classifyModel: 'gemini-flash-lite-latest',
  },
}

export const ACTIVE_PROVIDER = process.env.LLM_PROVIDER || 'groq'
// A second provider, tried when the first rejects a request. Defaults to Gemini whenever a
// Gemini key exists (it's already required for embeddings). LLM_FALLBACK=none disables it.
const FALLBACK_PROVIDER = process.env.LLM_FALLBACK === 'none'
  ? undefined
  : process.env.LLM_FALLBACK || (process.env.GEMINI_API_KEY && ACTIVE_PROVIDER !== 'gemini' ? 'gemini' : undefined)

const primary = PROVIDERS[ACTIVE_PROVIDER] ?? PROVIDERS.groq
const fallbackCfg = FALLBACK_PROVIDER ? PROVIDERS[FALLBACK_PROVIDER] : undefined

export const GENERATION_MODEL = process.env.LLM_GENERATION_MODEL || primary.generationModel

// Classify is pinned to Groq by default (a small fast model, regardless of generation provider).
// Override both provider and model via LLM_CLASSIFY_PROVIDER / LLM_CLASSIFY_MODEL.
export const CLASSIFY_PROVIDER = process.env.LLM_CLASSIFY_PROVIDER || 'groq'
const classifyProviderCfg = PROVIDERS[CLASSIFY_PROVIDER] ?? PROVIDERS.groq
export const CLASSIFY_MODEL = process.env.LLM_CLASSIFY_MODEL || classifyProviderCfg.classifyModel
const classifyFallbackCfg = FALLBACK_PROVIDER && FALLBACK_PROVIDER !== CLASSIFY_PROVIDER ? PROVIDERS[FALLBACK_PROVIDER] : undefined

const DEFAULT_TIMEOUT_GEN = 15_000
const DEFAULT_TIMEOUT_CLASSIFY = 5_000
const DEFAULT_STREAM_IDLE = 20_000

export type LLMOptions = { timeoutMs?: number; streamIdleMs?: number }

function makeClient(cfg: ProviderConfig): OpenAI {
  return new OpenAI({ apiKey: cfg.apiKey(), baseURL: cfg.baseURL, defaultHeaders: cfg.headers })
}

/** Provider-specific body fields, typed loosely because they extend the OpenAI schema. */
function extra(cfg: ProviderConfig | undefined, model: string): Record<string, unknown> {
  return cfg?.extraBody?.(model) ?? {}
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
    // Provider refused the request: retired/unknown model (400/404), bad or expired key
    // (401/403), no balance (402), rate limit (429), or an outage (5xx). Another
    // provider can still answer.
    const status = (err as { status?: number }).status
    if (typeof status === 'number' && [400, 401, 402, 403, 404, 408, 409, 429].concat([500, 502, 503, 504]).includes(status)) return true
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
      msg.includes('connect') ||
      msg.includes('model') ||
      msg.includes('api key') ||
      msg.includes('missing')
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
      console.warn('[llm]', ACTIVE_PROVIDER, 'failed (', errorCode(err), ') — falling back to', FALLBACK_PROVIDER)
      return fn(fb, fallbackCfg.generationModel, fallbackCfg)
    }
    throw err
  }
}

export async function generateText(prompt: string, opts: LLMOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_GEN
  return withFallback(async (c, model, cfg) => {
    const completion = await raceTimeout(
      c.chat.completions.create({ model, messages: [{ role: 'user', content: prompt }], ...extra(cfg, model) } as OpenAI.ChatCompletionCreateParamsNonStreaming),
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
      getClient().chat.completions.create({ model: GENERATION_MODEL, messages, stream: true, ...extra(primary, GENERATION_MODEL) } as OpenAI.ChatCompletionCreateParamsStreaming),
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
      console.warn('[llm] stream failed on', ACTIVE_PROVIDER, '(', errorCode(err), ') — falling back to', FALLBACK_PROVIDER)
      const fallbackStream = await fb.chat.completions.create({
        model: fallbackCfg.generationModel,
        messages,
        stream: true,
        ...extra(fallbackCfg, fallbackCfg.generationModel),
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

async function classifyWith(c: OpenAI, cfg: ProviderConfig, model: string, prompt: string, timeoutMs: number): Promise<string> {
  const completion = await raceTimeout(
    c.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      // The answer is one word, but reasoning models think first and that counts against
      // this cap. 10 tokens left them with an empty answer; this still caps cost tightly.
      max_tokens: 300,
      ...extra(cfg, model),
    } as OpenAI.ChatCompletionCreateParamsNonStreaming),
    timeoutMs
  )
  return (completion.choices[0]?.message?.content ?? '').trim()
}

let _classifyFallbackClient: OpenAI | undefined

export async function classify(prompt: string, opts: LLMOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_CLASSIFY
  try {
    return await classifyWith(getClassifyClient(), classifyProviderCfg, CLASSIFY_MODEL, prompt, timeoutMs)
  } catch (err) {
    if (!classifyFallbackCfg || !shouldFallback(err)) throw err
    console.warn('[llm] classify failed on', CLASSIFY_PROVIDER, '(', errorCode(err), ') — falling back to', FALLBACK_PROVIDER)
    if (!_classifyFallbackClient) _classifyFallbackClient = makeClient(classifyFallbackCfg)
    return classifyWith(_classifyFallbackClient, classifyFallbackCfg, classifyFallbackCfg.classifyModel, prompt, timeoutMs)
  }
}

export type LLMErrorCode = 'ai_model' | 'ai_auth' | 'ai_quota' | 'ai_timeout' | 'ai_unavailable' | 'internal'

/**
 * A short, non-sensitive category for an error, safe to show users and to log, so
 * "something went wrong" can be diagnosed without exposing provider messages or keys.
 */
export function errorCode(err: unknown): LLMErrorCode {
  const e = err as { status?: number; isTimeout?: boolean; message?: string }
  if (e?.isTimeout) return 'ai_timeout'
  const s = e?.status
  if (s === 400 || s === 404) return 'ai_model'
  if (s === 401 || s === 403) return 'ai_auth'
  if (s === 402 || s === 429) return 'ai_quota'
  if (typeof s === 'number' && s >= 500) return 'ai_unavailable'
  const m = (e?.message ?? '').toLowerCase()
  if (m.includes('api key') || m.includes('apikey') || m.includes('unauthorized')) return 'ai_auth'
  if (m.includes('model')) return 'ai_model'
  if (m.includes('fetch failed') || m.includes('network') || m.includes('econn')) return 'ai_unavailable'
  return 'internal'
}
