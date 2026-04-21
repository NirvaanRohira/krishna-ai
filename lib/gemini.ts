import { GoogleGenerativeAI } from '@google/generative-ai'

export const EMBEDDING_DIMENSION = 1536 // gemini-embedding-001 with outputDimensionality=1536; under pgvector 2000-dim index limit

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const _embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })
const _generationModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

export async function generateText(prompt: string): Promise<string> {
  const result = await _generationModel.generateContent(prompt)
  return result.response.text()
}

export async function* generateTextStream(prompt: string): AsyncGenerator<string> {
  const result = await _generationModel.generateContentStream(prompt)
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield text
  }
}

export async function classify(prompt: string): Promise<string> {
  const result = await _generationModel.generateContent(prompt)
  return result.response.text().trim()
}

export async function embedText(text: string): Promise<number[]> {
  const result = await _embeddingModel.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIMENSION,
  } as Parameters<typeof _embeddingModel.embedContent>[0])
  return result.embedding.values
}
