import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateText } from '@/lib/llm'
import { log } from '@/lib/log'

// One page of the Gita each day, the same for everyone, written once by the model and
// stored. The verse rotates through a hand-picked list (chapter 1's roll-call of warriors
// makes a poor morning verse), so the sequence is predictable and reviewable.

export const CURATED: [chapter: number, verse: number][] = [
  [2, 14], [2, 20], [2, 22], [2, 23], [2, 38], [2, 47], [2, 48], [2, 50], [2, 56], [2, 62], [2, 63], [2, 70],
  [3, 8], [3, 19], [3, 21], [3, 27], [3, 35], [3, 37], [4, 7], [4, 18], [4, 38], [4, 39], [5, 10], [5, 18],
  [5, 22], [6, 5], [6, 6], [6, 17], [6, 19], [6, 26], [6, 32], [6, 35], [7, 19], [9, 22], [9, 26], [9, 27],
  [10, 20], [11, 33], [12, 13], [12, 15], [12, 18], [13, 28], [14, 22], [15, 7], [16, 1], [16, 21], [17, 15],
  [17, 20], [18, 46], [18, 48], [18, 58], [18, 63], [18, 66], [18, 78],
]

export type DailyVerse = {
  day: string
  text_source: string
  book_chapter: number
  verse: number
  title: string
  moment: string
  teaching: string
  life: string
  practice: string
}

/** Today's date in India (the verse changes at midnight IST). */
export function indiaDay(now = Date.now()): string {
  return new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10)
}

export function verseForDay(day: string): [number, number] {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
  return CURATED[((n % CURATED.length) + CURATED.length) % CURATED.length]
}

function prompt(chapter: number, verse: number, sanskrit: string): string {
  return `You write one short daily reflection on a verse of the Bhagavad Gita for an app used by people in India. You are not Krishna and not divine; speak of Krishna in the third person.

The verse is Bhagavad Gita ${chapter}.${verse}. Its Sanskrit (romanised):
${sanskrit}

Return ONLY a JSON object with these string fields, in English, faithful to what this verse actually says (do not invent quotations):
- "title": 3 to 6 words naming the teaching.
- "moment": 2 sentences: where in the Gita this is spoken, and what Arjuna is facing.
- "teaching": 1 to 2 sentences: what the verse teaches.
- "life": 2 sentences: what it can mean for an ordinary person's day today (work, family, worry), without assuming their circumstances.
- "practice": 1 sentence: one small thing to try today.`
}

function parseJson(raw: string): Record<string, string> | null {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>
    const keys = ['title', 'moment', 'teaching', 'life', 'practice']
    if (!keys.every((k) => typeof o[k] === 'string' && (o[k] as string).trim())) return null
    return Object.fromEntries(keys.map((k) => [k, String(o[k]).trim().slice(0, 600)]))
  } catch {
    return null
  }
}

/** Creates today's verse if it doesn't exist yet. Service-role client (cron). */
export async function ensureDailyVerse(admin: SupabaseClient, day = indiaDay()): Promise<DailyVerse | null> {
  const { data: existing } = await admin.from('daily_verses').select('*').eq('day', day).maybeSingle()
  if (existing) return existing as DailyVerse

  const [chapter, verse] = verseForDay(day)
  const { data: row } = await admin
    .from('krishna_corpus')
    .select('text')
    .eq('text_source', 'bhagavad_gita')
    .eq('book_chapter', chapter)
    .eq('verse', verse)
    .maybeSingle()
  const sanskrit = (row as { text?: string } | null)?.text ?? ''

  const parsed = parseJson(await generateText(prompt(chapter, verse, sanskrit)))
  if (!parsed) {
    log.error('daily-verse', 'model did not return a usable page', { day, chapter, verse })
    return null
  }
  const record: DailyVerse = { day, text_source: 'bhagavad_gita', book_chapter: chapter, verse, ...parsed } as DailyVerse
  const { error } = await admin.from('daily_verses').insert(record)
  if (error && error.code !== '23505') throw error // 23505: another run made it first
  return record
}
