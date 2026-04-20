import type { RRFResult } from '@/lib/retrieval/rrfMerge'

export function buildFaithfulnessPrompt(response: string, sources: RRFResult[]): string {
  const sourceBlock = sources
    .map((s, i) => `[${i + 1}] ${s.text_source} ${s.book_chapter}.${s.verse}: ${s.text}`)
    .join('\n')

  return `Is the following response faithfully grounded in the provided source texts? It should not make claims not supported by the sources.

Response: ${response}

Source texts:
${sourceBlock}

Respond with exactly one word: FAITHFUL or NOT_FAITHFUL.`
}
