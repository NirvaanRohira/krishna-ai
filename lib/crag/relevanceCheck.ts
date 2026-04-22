import { classify } from '@/lib/llm'
import { buildRelevancePrompt } from '@/lib/prompts/relevance'
import type { RRFResult } from '@/lib/retrieval/rrfMerge'

export async function checkRelevance(query: string, sources: RRFResult[]): Promise<boolean> {
  if (sources.length === 0) return false
  const prompt = buildRelevancePrompt(query, sources)
  const result = await classify(prompt)
  return result.trim().toUpperCase() === 'RELEVANT'
}
