import { parallelRetrieve } from '@/lib/retrieval/parallelRetrieval'
import { generateText } from '@/lib/gemini'
import { checkRelevance } from '@/lib/crag/relevanceCheck'
import { expandQuery } from '@/lib/crag/queryExpansion'
import { buildPrompt } from '@/lib/prompts/chat'
import type { RRFResult } from '@/lib/retrieval/rrfMerge'
import type { SupabaseClient } from '@supabase/supabase-js'

type Message = { role: 'user' | 'assistant'; content: string }

const GIVE_UP = "I cannot find relevant guidance in the sacred texts for this question. Please consider consulting a qualified spiritual teacher or counselor."

export async function runCRAG(
  query: string,
  history: Message[],
  options: { topN?: number; supabaseClient?: SupabaseClient }
): Promise<{ response: string; sources: RRFResult[] }> {
  const MAX_RETRIES = 2
  let currentQuery = query
  let bestSources: RRFResult[] = []

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const sources = await parallelRetrieve(currentQuery, options)

    if (sources.length > 0 && bestSources.length === 0) bestSources = sources

    const relevant = await checkRelevance(currentQuery, sources)
    if (relevant) {
      const prompt = buildPrompt(sources, history, query)
      const response = await generateText(prompt)
      return { response, sources }
    }

    if (attempt < MAX_RETRIES) {
      currentQuery = expandQuery(query)
    }
  }

  // Soft fallback: we have sources but none passed relevance — still generate from best
  if (bestSources.length > 0) {
    const prompt = buildPrompt(bestSources, history, query)
    const response = await generateText(prompt)
    return { response, sources: bestSources }
  }

  // Hard give-up: retrieval returned nothing across all attempts
  return { response: GIVE_UP, sources: [] }
}
