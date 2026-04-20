import type { RRFResult } from '@/lib/retrieval/rrfMerge'

export function buildRelevancePrompt(query: string, sources: RRFResult[]): string {
  const sourceBlock = sources
    .map((s, i) => `[${i + 1}] ${s.text_source} ${s.book_chapter}.${s.verse}: ${s.text}`)
    .join('\n')

  return `The sacred texts speak to every dimension of human experience — duty, attachment, fear, relationships, purpose, loss, anger, confusion. A yogi draws on these principles to address any genuine human struggle, even when the exact situation is not named in the text.

Does the retrieved context contain wisdom that could be applied — even indirectly — to the question below? Consider whether any teaching about dharma, karma, attachment, self-nature, or equanimity is relevant to the person's situation.

Question: ${query}

Retrieved context:
${sourceBlock}

Respond with exactly one word: RELEVANT or NOT_RELEVANT.`
}
