import Groq from 'groq-sdk'

export const GENERATION_MODEL = 'llama-3.3-70b-versatile'
export const CLASSIFY_MODEL = 'llama-3.1-8b-instant'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export async function generateText(prompt: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [{ role: 'user', content: prompt }],
  })
  return completion.choices[0]?.message?.content ?? ''
}

export async function* generateTextStream(prompt: string): AsyncGenerator<string> {
  const stream = await groq.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  })
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? ''
    if (text) yield text
  }
}

export async function classify(prompt: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: CLASSIFY_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 10,
  })
  return (completion.choices[0]?.message?.content ?? '').trim()
}
