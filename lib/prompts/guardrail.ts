export function buildGuardrailPrompt(message: string): string {
  return `You are a safety classifier for a spiritual guidance AI. Classify the following message into exactly one category.

Categories:
- SAFE: Normal spiritual, philosophical, or personal growth questions
- CRISIS: Any message indicating suicidal ideation, self-harm, or immediate danger to self or others
- MEDICAL: Questions about symptoms, diagnoses, medications, or treatment
- LEGAL_FINANCIAL: Questions about lawsuits, legal advice, financial advice, or investments
- DIVINITY_CLAIM: User asking if the AI is God, divine, or an actual deity
- POLITICAL: Questions about politics, government policy, or geopolitical conflicts

Respond with ONLY the category name. No explanation.

Message: ${message}

Category:`
}
