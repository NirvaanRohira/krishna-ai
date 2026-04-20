import type { RRFResult } from '@/lib/retrieval/rrfMerge'

export function buildRelevancePrompt(query: string, sources: RRFResult[]): string {
  const sourceBlock = sources
    .map((s, i) => `[${i + 1}] ${s.text_source} ${s.book_chapter}.${s.verse}: ${s.text}`)
    .join('\n')

  return `Does the following retrieved context contain information relevant to answering the question?

Question: ${query}

Retrieved context:
${sourceBlock}

Respond with exactly one word: RELEVANT or NOT_RELEVANT.`
}
