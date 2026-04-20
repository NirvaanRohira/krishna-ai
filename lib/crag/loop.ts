import { parallelRetrieve } from '@/lib/retrieval/parallelRetrieval'
import { generateText } from '@/lib/gemini'
import { checkRelevance } from '@/lib/crag/relevanceCheck'
import { checkFaithfulness } from '@/lib/crag/faithfulnessCheck'
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const sources = await parallelRetrieve(currentQuery, options)

    const relevant = await checkRelevance(currentQuery, sources)
    if (!relevant) {
      if (attempt === MAX_RETRIES) return { response: GIVE_UP, sources: [] }
      currentQuery = expandQuery(query)
      continue
    }

    const prompt = buildPrompt(sources, history, query)
    const response = await generateText(prompt)

    const faithful = await checkFaithfulness(response, sources)
    if (!faithful) {
      if (attempt === MAX_RETRIES) return { response: GIVE_UP, sources: [] }
      currentQuery = expandQuery(query)
      continue
    }

    return { response, sources }
  }

  return { response: GIVE_UP, sources: [] }
}
