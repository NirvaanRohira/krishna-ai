import { classify } from '@/lib/llm'
import { buildGuardrailPrompt } from '@/lib/prompts/guardrail'

export type GuardrailCategory = 'SAFE' | 'CRISIS' | 'MEDICAL' | 'LEGAL_FINANCIAL' | 'DIVINITY_CLAIM' | 'POLITICAL'

// Priority order for token matching: the MOST protective / least-bypassing labels are
// checked first, so a noisy output containing multiple tokens (e.g. "CRISIS / MEDICAL")
// escalates to the safer category, and SAFE (the only label that reaches the main LLM
// unguarded) is matched last.
const PRIORITY_ORDER: GuardrailCategory[] = [
  'CRISIS', 'MEDICAL', 'LEGAL_FINANCIAL', 'DIVINITY_CLAIM', 'POLITICAL', 'SAFE',
]

// Conservative default when the classifier output is empty or contains no recognizable
// category token. This is a spiritual/mental-health product, so an unknown/garbled
// classification must NEVER be treated as SAFE (which would send it to the main LLM
// unguarded). We fall to CRISIS — the most protective label — so a genuine crisis can
// never be silently mislabeled SAFE by a formatting quirk or a garbage response.
const FAILSAFE_DEFAULT: GuardrailCategory = 'CRISIS'

/**
 * Robustly parse a classifier's raw output into a canonical category.
 * Strips markdown fences and whitespace, uppercases, then scans (in priority order)
 * for a known category token as a substring — so "Category: CRISIS.", a fenced
 * ```\nCRISIS\n```, or lowercase "crisis" all resolve to CRISIS instead of falling
 * through to SAFE. If nothing matches, returns the fail-safe default (CRISIS).
 */
export function parseGuardrailCategory(raw: string): GuardrailCategory {
  const cleaned = raw
    .replace(/```/g, ' ')  // strip markdown code fences
    .replace(/[`*]/g, ' ') // strip stray markdown emphasis chars — NOT underscore, which is part of category names (LEGAL_FINANCIAL, DIVINITY_CLAIM)
    .toUpperCase()

  for (const category of PRIORITY_ORDER) {
    if (cleaned.includes(category)) return category
  }
  return FAILSAFE_DEFAULT
}

export async function classifyMessage(message: string): Promise<GuardrailCategory> {
  const prompt = buildGuardrailPrompt(message)
  const result = await classify(prompt)
  return parseGuardrailCategory(result)
}
