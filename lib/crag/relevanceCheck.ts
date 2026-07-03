import { classify } from '@/lib/llm'
import { buildRelevancePrompt } from '@/lib/prompts/relevance'
import type { RRFResult } from '@/lib/retrieval/rrfMerge'

export async function checkRelevance(query: string, sources: RRFResult[]): Promise<boolean> {
  if (sources.length === 0) return false
  try {
    const prompt = buildRelevancePrompt(query, sources)
    const result = await classify(prompt)
    const upper = result.trim().toUpperCase()
    return upper.startsWith('RELEVANT') && !upper.startsWith('NOT_RELEVANT')
  } catch (err) {
    // A classify hiccup (Groq 429/outage/timeout) must NOT take down chat.
    // Safe default: proceed to generate from the retrieved sources rather than erroring.
    console.error('[relevanceCheck] classify failed — defaulting to relevant (proceed):', err)
    return true
  }
}
