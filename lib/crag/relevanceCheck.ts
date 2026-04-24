import { classify } from '@/lib/llm'
import { buildRelevancePrompt } from '@/lib/prompts/relevance'
import type { RRFResult } from '@/lib/retrieval/rrfMerge'

export async function checkRelevance(query: string, sources: RRFResult[]): Promise<boolean> {
  if (sources.length === 0) return false
  const prompt = buildRelevancePrompt(query, sources)
  const result = await classify(prompt)
  const upper = result.trim().toUpperCase()
  return upper.startsWith('RELEVANT') && !upper.startsWith('NOT_RELEVANT')
}
