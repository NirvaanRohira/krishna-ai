export function buildRouterPrompt(query: string): string {
  return `Classify the following question as either SIMPLE or COMPLEX.

SIMPLE: factual questions about scripture (who is a character, what does a term mean, what chapter covers a topic).
COMPLEX: personal life situations, emotional struggles, ethical dilemmas, or questions requiring wisdom applied to real circumstances.

Respond with exactly one word: SIMPLE or COMPLEX.

Question: ${query}`
}
