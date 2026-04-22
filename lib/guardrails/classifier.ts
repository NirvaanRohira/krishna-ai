import { classify } from '@/lib/llm'
import { buildGuardrailPrompt } from '@/lib/prompts/guardrail'

export type GuardrailCategory = 'SAFE' | 'CRISIS' | 'MEDICAL' | 'LEGAL_FINANCIAL' | 'DIVINITY_CLAIM' | 'POLITICAL'

const VALID_CATEGORIES = new Set<GuardrailCategory>([
  'SAFE', 'CRISIS', 'MEDICAL', 'LEGAL_FINANCIAL', 'DIVINITY_CLAIM', 'POLITICAL',
])

export async function classifyMessage(message: string): Promise<GuardrailCategory> {
  const prompt = buildGuardrailPrompt(message)
  const result = (await classify(prompt)).trim().toUpperCase() as GuardrailCategory
  return VALID_CATEGORIES.has(result) ? result : 'SAFE'
}
