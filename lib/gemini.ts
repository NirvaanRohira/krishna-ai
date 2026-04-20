import { GoogleGenerativeAI } from '@google/generative-ai'

export const EMBEDDING_DIMENSION = 3072 // gemini-embedding-001; schema uses vector(3072)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const _generationModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
const _embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

export async function generateText(prompt: string): Promise<string> {
  const result = await _generationModel.generateContent(prompt)
  return result.response.text()
}

export async function classify(prompt: string): Promise<string> {
  const result = await _generationModel.generateContent(prompt)
  return result.response.text().trim()
}

// Returns a 3072-dimensional embedding vector.
export async function embedText(text: string): Promise<number[]> {
  const result = await _embeddingModel.embedContent(text)
  return result.embedding.values
}
