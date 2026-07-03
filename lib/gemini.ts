import { GoogleGenerativeAI } from '@google/generative-ai'

// Embeddings only — generation and classification moved to lib/groq.ts
export const EMBEDDING_DIMENSION = 1536 // gemini-embedding-001 with outputDimensionality=1536; under pgvector 2000-dim index limit

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const _embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

const DEFAULT_EMBED_TIMEOUT = 8_000

export async function embedText(text: string, opts: { timeoutMs?: number } = {}): Promise<number[]> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_EMBED_TIMEOUT
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const embedPromise = (_embeddingModel.embedContent as any)({
    content: { parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIMENSION,
  })
  // This is the only network call previously lacking a timeout — a hung embedding
  // could hang the whole request. Race it against a timeout so callers (e.g.
  // parallelRetrieve's allSettled) can degrade to sparse-only on a stall.
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`embedText timeout after ${timeoutMs}ms`)), timeoutMs)
  })
  try {
    const result = await Promise.race([embedPromise, timeout])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (result as any).embedding.values
  } finally {
    if (timer) clearTimeout(timer)
  }
}
