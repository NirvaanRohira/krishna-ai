import { GoogleGenerativeAI } from '@google/generative-ai'

export const EMBEDDING_DIMENSION = 3072 // gemini-embedding-001; schema uses vector(3072)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const _embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

async function openRouterGenerate(prompt: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      models: [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemma-3-27b-it:free',
        'mistralai/mistral-7b-instruct:free',
      ],
      route: 'fallback',
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return json.choices[0].message.content as string
}

export async function generateText(prompt: string): Promise<string> {
  return openRouterGenerate(prompt)
}

export async function classify(prompt: string): Promise<string> {
  return (await openRouterGenerate(prompt)).trim()
}

// Returns a 3072-dimensional embedding vector.
export async function embedText(text: string): Promise<number[]> {
  const result = await _embeddingModel.embedContent(text)
  return result.embedding.values
}
