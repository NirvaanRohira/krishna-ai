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
    generationModel: 'deepseek-chat',
    classifyModel: 'deepseek-chat',
  },
}

export const ACTIVE_PROVIDER = process.env.LLM_PROVIDER ?? 'groq'
const FALLBACK_PROVIDER = process.env.LLM_FALLBACK

const primary = PROVIDERS[ACTIVE_PROVIDER] ?? PROVIDERS.groq
const fallbackCfg = FALLBACK_PROVIDER ? PROVIDERS[FALLBACK_PROVIDER] : undefined

// Override individual models without changing provider — set in .env.local
export const GENERATION_MODEL = process.env.LLM_GENERATION_MODEL ?? primary.generationModel
export const CLASSIFY_MODEL = process.env.LLM_CLASSIFY_MODEL ?? primary.classifyModel

function makeClient(cfg: ProviderConfig): OpenAI {
  return new OpenAI({ apiKey: cfg.apiKey(), baseURL: cfg.baseURL })
}

const client = makeClient(primary)
const fallbackClient = fallbackCfg ? makeClient(fallbackCfg) : undefined

function shouldFallback(err: unknown): boolean {
  if (err instanceof Error) {
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
    return await fn(client, GENERATION_MODEL, CLASSIFY_MODEL)
  } catch (err) {
    if (fallbackClient && fallbackCfg && shouldFallback(err)) {
      console.warn('[llm] rate limit on', ACTIVE_PROVIDER, '— falling back to', FALLBACK_PROVIDER)
      return fn(fallbackClient, fallbackCfg.generationModel, fallbackCfg.classifyModel)
    }
    throw err
  }
}

export async function generateText(prompt: string): Promise<string> {
  return withFallback(async (c, model) => {
    const completion = await c.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
    })
    return completion.choices[0]?.message?.content ?? ''
  })
}

export async function* generateTextStream(prompt: string): AsyncGenerator<string> {
  const stream = await withFallback(async (c, model) =>
    c.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    })
  )
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? ''
    if (text) yield text
  }
}

export async function classify(prompt: string): Promise<string> {
  return withFallback(async (c, _gen, classifyModel) => {
    const completion = await c.chat.completions.create({
      model: classifyModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
    })
    return (completion.choices[0]?.message?.content ?? '').trim()
  })
}
