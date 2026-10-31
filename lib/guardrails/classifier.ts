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

// Used only when the classifier itself is unavailable (provider outage, retired model, empty
// reply). Catches crisis language in English, Hindi and Hinglish so a person in danger still
// gets helplines; everything else proceeds. Failing every message during an outage would
// take the product down, and calling every message CRISIS would make it useless.
const CRISIS_PATTERNS: RegExp[] = [
  /\b(kill|hurt|harm)\s+my\s*self\b/i,
  /\bsuicid/i,
  /\bend\s+(my|this)\s+life\b/i,
  /\b(want|wanna|going)\s+to\s+die\b/i,
  /\bno\s+(reason|point)\s+(to|in)\s+(live|living)\b/i,
  /\bself[-\s]?harm/i,
  /\bcut(ting)?\s+my\s*self\b/i,
  /\b(khud\s*kushi|khudkushi|aatmhatya|atmahatya)\b/i,
  /\bmarna\s+(chahta|chahti|hai)\b/i,
  /\bjeena\s+nahi\b/i,
  /आत्महत्या|ख़ुदकुशी|खुदकुशी|मरना\s*चाहत|जीना\s*नहीं|जान\s*दे\s*द/,
]

export function localCrisisCheck(message: string): GuardrailCategory {
  return CRISIS_PATTERNS.some((re) => re.test(message)) ? 'CRISIS' : 'SAFE'
}

export async function classifyMessage(message: string): Promise<GuardrailCategory> {
  const prompt = buildGuardrailPrompt(message)
  let result: string
  try {
    result = await classify(prompt)
  } catch (err) {
    console.error('[guardrail] classifier unavailable — using local crisis check:', err instanceof Error ? err.message : err)
    return localCrisisCheck(message)
  }
  // An empty reply means the classifier didn't answer (e.g. a reasoning model ran out of
  // room): an outage, not a verdict. Garbage text still fails safe to CRISIS below.
  if (!result.trim()) return localCrisisCheck(message)
  return parseGuardrailCategory(result)
}
