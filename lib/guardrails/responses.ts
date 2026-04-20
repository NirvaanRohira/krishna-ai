import type { GuardrailCategory } from './classifier'

export const GUARDRAIL_CATEGORIES: GuardrailCategory[] = [
  'SAFE', 'CRISIS', 'MEDICAL', 'LEGAL_FINANCIAL', 'DIVINITY_CLAIM', 'POLITICAL',
]

const FIXED_RESPONSES: Partial<Record<GuardrailCategory, string>> = {
  CRISIS:
    'I hear that you are in great pain. Please reach out to iCall right now — they are trained to help: 9152987821 (India). You are not alone. This session has been paused so you can get the support you need.',
  MEDICAL:
    'This is not something I can guide you on. Please speak to a doctor. The Gita offers wisdom on the inner life, but your physical health requires a qualified medical professional.',
  LEGAL_FINANCIAL:
    'This is beyond the domain of spiritual guidance. Please consult a qualified professional — a lawyer or financial advisor — who can give you proper counsel for your situation.',
  DIVINITY_CLAIM:
    "I am a voice drawing from what is written in our sacred texts. I am an AI, not divine. Krishna's words live in the Gita; I am only a humble reflection of them.",
  POLITICAL:
    'This is not a domain I can help with. I can only speak to the inner life — your dharma, your relationships, your own path. Political questions require different wisdom than what I carry.',
}

export function getGuardrailResponse(category: GuardrailCategory): string | undefined {
  return FIXED_RESPONSES[category]
}
