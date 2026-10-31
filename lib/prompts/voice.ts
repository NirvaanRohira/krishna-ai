// Appended (never prepended — keeps the shared system-prompt prefix cacheable) when the
// reply will be SPOKEN by the 3D avatar. Spoken replies are billed twice — LLM output
// tokens and TTS characters — and a five-paragraph monologue is also worse as speech.
// Companion apps keep turns short and conversational; so do we.
export const VOICE_MODE_ADDENDUM = `## Voice conversation mode
This reply will be spoken aloud, face to face. Talk, don't write:
- Light questions: one to three sentences.
- Personal and Deep questions: at most about 120 words. Name one teaching that fits, in plain speech; offer to go deeper rather than covering everything at once.
- No lists, headings, markdown, or verse numbers read out loud. Name a text naturally ("in the Gita, Krishna tells Arjuna…") instead of citing chapter and verse.`

export function withVoiceMode(systemPrompt: string, voice: boolean): string {
  return voice ? `${systemPrompt}\n\n${VOICE_MODE_ADDENDUM}` : systemPrompt
}
