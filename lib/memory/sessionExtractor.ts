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

// Light shape validation: the LLM can return valid JSON with the wrong shape
// (e.g. recurring_themes as a string, or life_context as a number). We coerce
// each field to its expected type and drop anything malformed, so downstream
// text[] upserts never receive garbage.
function coerceProfile(parsed: unknown): ExtractedProfile {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const obj = parsed as Record<string, unknown>
  const result: ExtractedProfile = {}

  const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  const asStringArray = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined

  const life_context = asString(obj.life_context)
  if (life_context !== undefined) result.life_context = life_context

  const current_life_stage = asString(obj.current_life_stage)
  if (current_life_stage !== undefined) result.current_life_stage = current_life_stage

  const recurring_themes = asStringArray(obj.recurring_themes)
  if (recurring_themes !== undefined) result.recurring_themes = recurring_themes

  const primary_attachments = asStringArray(obj.primary_attachments)
  if (primary_attachments !== undefined) result.primary_attachments = primary_attachments

  const entry = obj.previous_guidance_entry
  if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
    const e = entry as Record<string, unknown>
    const topic = asString(e.topic)
    const summary = asString(e.summary)
    const texts_cited = asStringArray(e.texts_cited)
    // require the string fields; default texts_cited to [] if absent/malformed
    if (topic !== undefined && summary !== undefined) {
      result.previous_guidance_entry = { topic, summary, texts_cited: texts_cited ?? [] }
    }
  }

  return result
}

export async function extractSessionProfile(transcript: string): Promise<ExtractedProfile> {
  const raw = await generateText(EXTRACTION_PROMPT(transcript))

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return coerceProfile(JSON.parse(cleaned))
  } catch {
    return {}
  }
}
