import { parallelRetrieve } from '@/lib/retrieval/parallelRetrieval'
import { generateText, generateTextStream } from '@/lib/llm'
import { checkRelevance } from '@/lib/crag/relevanceCheck'
import { expandQuery } from '@/lib/crag/queryExpansion'
import { buildPrompt } from '@/lib/prompts/chat'
import type { RRFResult } from '@/lib/retrieval/rrfMerge'
import type { LookupResult } from '@/lib/retrieval/structuralLookup'
import type { SupabaseClient } from '@supabase/supabase-js'

type Message = { role: 'user' | 'assistant'; content: string }

const GIVE_UP = "I cannot find relevant guidance in the sacred texts for this question. Please consider consulting a qualified spiritual teacher or counselor."

async function generate(
  prompt: string,
  onChunk?: (chunk: string) => Promise<void>
): Promise<string> {
  if (!onChunk) return generateText(prompt)
  let full = ''
  for await (const chunk of generateTextStream(prompt)) {
    full += chunk
    await onChunk(chunk)
  }
  return full
}

export async function runCRAG(
  query: string,
  history: Message[],
  options: { topN?: number; supabaseClient?: SupabaseClient; systemPrompt?: string; anchors?: LookupResult[]; onChunk?: (chunk: string) => Promise<void>; prefetchedSources?: RRFResult[]; originalMessage?: string }
): Promise<{ response: string; sources: RRFResult[] }> {
  const MAX_RETRIES = 1
  let currentQuery = query
  let bestSources: RRFResult[] = []

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const t = Date.now()
    const sources = attempt === 0 && options.prefetchedSources
      ? options.prefetchedSources
      : await parallelRetrieve(currentQuery, options)

    if (sources.length > 0 && bestSources.length === 0) bestSources = sources

    const relevant = await checkRelevance(currentQuery, sources)
    console.log(`[timing] CRAG attempt ${attempt}: relevance=${relevant} (${Date.now()-t}ms)`)
    if (relevant) {
      const displayMessage = options.originalMessage ?? query
      const prompt = buildPrompt(sources, history, displayMessage, options.systemPrompt, options.anchors)
      const response = await generate(prompt, options.onChunk)
      return { response, sources }
    }

    if (attempt < MAX_RETRIES) {
      currentQuery = expandQuery(query)
    }
  }

  // Soft fallback: we have sources but none passed relevance — still generate from best
  if (bestSources.length > 0) {
    const displayMessage = options.originalMessage ?? query
    const prompt = buildPrompt(bestSources, history, displayMessage, options.systemPrompt, options.anchors)
    const response = await generate(prompt, options.onChunk)
    return { response, sources: bestSources }
  }

  // Hard give-up: retrieval returned nothing across all attempts
  return { response: GIVE_UP, sources: [] }
}
