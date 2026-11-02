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

    // The relevance check only matters when it can change what happens next: a retry with
    // an expanded query. When there is no expansion to try, both outcomes write from these
    // same passages, so asking costs a whole model round trip before the first word for
    // nothing. Skip it then.
    const canRetry = attempt < MAX_RETRIES && expandQuery(query) !== currentQuery
    if (!canRetry && sources.length > 0) {
      const displayMessage = options.originalMessage ?? query
      const prompt = buildPrompt(sources, history, displayMessage, options.systemPrompt, options.anchors)
      const response = await generate(prompt, options.onChunk)
      return { response, sources }
    }

    const relevant = await checkRelevance(currentQuery, sources)
    console.log(`[timing] CRAG attempt ${attempt}: relevance=${relevant} (${Date.now()-t}ms)`)
    if (relevant) {
      const displayMessage = options.originalMessage ?? query
      const prompt = buildPrompt(sources, history, displayMessage, options.systemPrompt, options.anchors)
      const response = await generate(prompt, options.onChunk)
      return { response, sources }
    }

    if (attempt < MAX_RETRIES) {
      const expanded = expandQuery(query)
      // expandQuery only rewrites queries containing Sanskrit terms. For a typical
      // English query it returns the same string, so the retry would repeat the exact
      // same retrieval + relevance check for an identical verdict — doubled latency and
      // cost. Skip the retry in that case and fall through to the soft fallback.
      if (expanded === currentQuery) break
      currentQuery = expanded
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
