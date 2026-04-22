import { GoogleGenerativeAI } from '@google/generative-ai'

// Embeddings only — generation and classification moved to lib/groq.ts
export const EMBEDDING_DIMENSION = 1536 // gemini-embedding-001 with outputDimensionality=1536; under pgvector 2000-dim index limit

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const _embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

export async function embedText(text: string): Promise<number[]> {
  const result = await _embeddingModel.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIMENSION,
  } as Parameters<typeof _embeddingModel.embedContent>[0])
  return result.embedding.values
}
