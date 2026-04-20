import { classify } from '@/lib/gemini'
import { buildFaithfulnessPrompt } from '@/lib/prompts/faithfulness'
import type { RRFResult } from '@/lib/retrieval/rrfMerge'

export async function checkFaithfulness(response: string, sources: RRFResult[]): Promise<boolean> {
  const prompt = buildFaithfulnessPrompt(response, sources)
  const result = await classify(prompt)
  return result.trim().toUpperCase() === 'FAITHFUL'
}
