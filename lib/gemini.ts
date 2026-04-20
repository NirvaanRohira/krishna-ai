import { GoogleGenerativeAI } from '@google/generative-ai'

export const EMBEDDING_DIMENSION = 3072 // gemini-embedding-001; schema uses vector(3072)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const _embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

const OPENROUTER_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'

async function openRouterGenerate(prompt: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
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

export async function* generateTextStream(prompt: string): AsyncGenerator<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const token = json.choices?.[0]?.delta?.content
        if (token) yield token
      } catch { /* skip malformed SSE lines */ }
    }
  }
}

export async function classify(prompt: string): Promise<string> {
  return (await openRouterGenerate(prompt)).trim()
}

// Returns a 3072-dimensional embedding vector.
export async function embedText(text: string): Promise<number[]> {
  const result = await _embeddingModel.embedContent(text)
  return result.embedding.values
}
