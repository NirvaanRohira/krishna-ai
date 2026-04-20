import { GoogleGenerativeAI } from '@google/generative-ai'

export const EMBEDDING_DIMENSION = 768 // text-embedding-004; schema uses vector(768)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const _generationModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
const _embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' })

export async function generateText(prompt: string): Promise<string> {
  const result = await _generationModel.generateContent(prompt)
  return result.response.text()
}

// Classification tasks (router, guardrails, relevance/faithfulness checks).
// Same model as generation — Gemini Flash is fast enough for single-token outputs.
export async function classify(prompt: string): Promise<string> {
  const result = await _generationModel.generateContent(prompt)
  return result.response.text().trim()
}

// Returns a 768-dimensional embedding vector.
export async function embedText(text: string): Promise<number[]> {
  const result = await _embeddingModel.embedContent(text)
  return result.embedding.values
}
