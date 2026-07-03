import { classify } from '@/lib/llm'
import { buildRouterPrompt } from '@/lib/prompts/router'

export async function classifyComplexity(query: string): Promise<'SIMPLE' | 'COMPLEX'> {
  try {
    const prompt = buildRouterPrompt(query)
    const result = await classify(prompt)
    return result.trim().toUpperCase() === 'SIMPLE' ? 'SIMPLE' : 'COMPLEX'
  } catch (err) {
    // classifyComplexity runs inside the chat route's Promise.all fan-out; a classify
    // failure (Groq 429/outage/timeout, or GROQ_API_KEY unset) must degrade rather than
    // reject the whole request. Default to COMPLEX — the safer, more thorough path.
    console.error('[complexityRouter] classify failed — defaulting to COMPLEX:', err)
    return 'COMPLEX'
  }
}
