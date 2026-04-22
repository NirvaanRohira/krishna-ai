import { classify } from '@/lib/llm'
import { buildRouterPrompt } from '@/lib/prompts/router'

export async function classifyComplexity(query: string): Promise<'SIMPLE' | 'COMPLEX'> {
  const prompt = buildRouterPrompt(query)
  const result = await classify(prompt)
  return result.trim().toUpperCase() === 'SIMPLE' ? 'SIMPLE' : 'COMPLEX'
}
