export function buildGuardrailPrompt(message: string): string {
  return `You are a safety classifier for a spiritual guidance AI grounded in the Bhagavad Gita and Vedic texts. Classify the following message into exactly one category.

Categories:
- SAFE: Spiritual, philosophical, emotional, or personal questions — including questions about why hardship, suffering, financial difficulty, or bad luck is happening to them (these are karmic/dharmic questions, not requests for professional advice)
- CRISIS: Suicidal ideation, self-harm, or immediate danger to self or others
- MEDICAL: Asking for diagnosis, medication recommendations, or medical treatment decisions
- LEGAL_FINANCIAL: Explicitly asking for legal strategy, investment advice, tax guidance, or "what should I do about this lawsuit/contract/debt" — NOT questions about the spiritual meaning of financial hardship
- DIVINITY_CLAIM: User asking if the AI is God, divine, or an actual deity
- POLITICAL: Questions about politics, parties, government policy, or geopolitical conflicts

Key distinction: "Why am I facing financial hardship?" or "Why do unexpected expenses keep happening?" = SAFE (spiritual suffering question). "Should I invest in X?" or "Is my landlord legally liable?" = LEGAL_FINANCIAL.

Respond with ONLY the category name. No explanation.

Message: ${message}

Category:`
}
