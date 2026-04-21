export const BATCH_OUTPUT_DIM = 1536

export interface InlinedRequest {
  content: { parts: [{ text: string }] }
  outputDimensionality: number
}

export interface EmbeddingResponse {
  embedding: { values: number[] }
}

export function buildInlinedRequests(
  rows: Array<{ id: number; text: string }>
): InlinedRequest[] {
  return rows.map(r => ({
    content: { parts: [{ text: r.text }] },
    outputDimensionality: BATCH_OUTPUT_DIM,
  }))
}

export function extractEmbeddings(
  responses: EmbeddingResponse[],
  rows: Array<{ id: number }>
): Array<{ id: number; embedding: number[] }> {
  if (responses.length !== rows.length) {
    throw new Error(
      `response count mismatch: got ${responses.length} responses for ${rows.length} rows`
    )
  }
  return rows.map((r, i) => ({ id: r.id, embedding: responses[i].embedding.values }))
}
