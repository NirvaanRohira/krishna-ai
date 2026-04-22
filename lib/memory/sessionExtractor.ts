import { generateText } from '@/lib/llm'

export type ExtractedProfile = {
  life_context?: string
  recurring_themes?: string[]
  primary_attachments?: string[]
  current_life_stage?: string
  previous_guidance_entry?: {
    topic: string
    texts_cited: string[]
    summary: string
  }
}

const EXTRACTION_PROMPT = (transcript: string) => `You are analyzing a spiritual guidance conversation to extract key profile information about the seeker.

Conversation transcript:
${transcript}

Extract a JSON object with these fields (omit any field you cannot determine from the conversation):
- life_context: one sentence describing the person's current life situation
- recurring_themes: array of spiritual/life themes that came up (e.g. ["duty", "attachment", "fear of failure"])
- primary_attachments: array of things this person is attached to (e.g. ["family approval", "career success"])
- current_life_stage: one of brahmacharya, grihastha, vanaprastha, sannyasa (or omit if unclear)
- previous_guidance_entry: object with topic (string), texts_cited (array), summary (string)

Respond with ONLY valid JSON. No explanation.`

export async function extractSessionProfile(transcript: string): Promise<ExtractedProfile> {
  const raw = await generateText(EXTRACTION_PROMPT(transcript))

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as ExtractedProfile
  } catch {
    return {}
  }
}
