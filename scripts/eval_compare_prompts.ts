/**
 * Side-by-side prompt comparison: runs all eval questions through both
 * system_v1 and system_v2, captures responses + scores + diffs, writes
 * a single markdown file showing both responses for each question.
 *
 * Run: npx tsx --env-file=.env.local scripts/eval_compare_prompts.ts
 */

import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { SYSTEM_PROMPT_V1 } from '../lib/prompts/system_v1'
import { SYSTEM_PROMPT_V2 } from '../lib/prompts/system_v2'

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY!
const GEMINI_KEY = process.env.GEMINI_API_KEY!
const EMBEDDING_DIM = 1536
const MODEL = 'deepseek-v4-flash'

const PRICE_INPUT_PER_M = 0.07
const PRICE_CACHE_HIT_PER_M = 0.007
const PRICE_OUTPUT_PER_M = 0.28

// ── Test questions ────────────────────────────────────────────────────────────
// Including 3 NEW question types that v1 historically struggled with:
// - Q11: trivial everyday question (should NOT cite scripture)
// - Q12: playful/hypothetical question (should engage with humor)
// - Q13: question in Hindi (should respond in Hindi)
const QUESTIONS = [
  {
    id: 1,
    label: 'Life-stage depth (vanaprastha / stri dharma)',
    question: "What should a woman do after her children have grown and left home? She is 55 and feels lost.",
    expectedBehavior: 'deep response with vanaprastha framework + bhagavatam citations',
  },
  {
    id: 2,
    label: 'Ashrama framework (grihastha)',
    question: "I am 28, newly married. What are my duties as a householder according to the sacred texts?",
    expectedBehavior: 'personal/deep response, grihastha duties, specific Bhagavatam passages',
  },
  {
    id: 3,
    label: 'CRAG deep question (fear / paralysis)',
    question: "I feel completely paralyzed by fear of failing my family. Every decision I make feels wrong and I am spiraling.",
    expectedBehavior: 'deep response, address fear + dharma, specific Gita verses',
  },
  {
    id: 4,
    label: 'Fruit of action (nishkama karma)',
    question: "What does the Gita say about the fruit of action — should I expect reward for doing my duty?",
    expectedBehavior: 'personal response, Gita 2.47 and surrounding teaching',
  },
  {
    id: 5,
    label: 'Desire and kama',
    question: "I keep being pulled back to the same destructive habits even when I know they harm me. Why can I not stop?",
    expectedBehavior: 'personal response, kama/prakriti, name the likely ashrama briefly',
  },
  {
    id: 6,
    label: 'Ego and ahamkara',
    question: "I am very successful professionally but I feel hollow inside. My identity feels fake. What is the teaching here?",
    expectedBehavior: 'deep response, ahamkara teaching, Gita Ch16 and Bhagavatam',
  },
  {
    id: 7,
    label: 'Family conflict and obligation to kin',
    question: "My elderly parents want to move in with us but my wife objects. I feel torn between filial duty and my marriage. What do the texts say?",
    expectedBehavior: 'deep response, dharma conflict, grihastha framework',
  },
  {
    id: 8,
    label: 'Marital harmony',
    question: "My husband and I fight constantly about small things. The love feels eroded. Is there dharmic guidance for marriage?",
    expectedBehavior: 'personal response, marriage as sadhana, grihastha dharma',
  },
  {
    id: 9,
    label: 'Brahmacharya — youth and purpose',
    question: "I am 22 and torn between pursuing the career my parents want and what I feel called to study. How do I choose?",
    expectedBehavior: 'personal response, brahmacharya, svadharma',
  },
  {
    id: 10,
    label: 'Vanaprastha / sannyasa boundary',
    question: "I am 70, retired, and feel called to give everything up and live simply. Is this the right time for sannyasa?",
    expectedBehavior: 'deep response, sannyasa vs vanaprastha distinction',
  },
  // ── NEW: tests that probe the v1 weaknesses ─────────────────────────────
  {
    id: 11,
    label: 'TRIVIAL — should NOT cite scripture',
    question: "I really want to sleep but I am waiting for someone to come home — if I go to sleep what do I do",
    expectedBehavior: 'brief, warm, no scripture, no ashrama, no follow-up question required',
  },
  {
    id: 12,
    label: 'PLAYFUL — should engage with humor',
    question: "What does the Bhagavad Gita say about the best ways to win at a poker game?",
    expectedBehavior: 'engage the spirit of the question (non-attachment to winning), NOT refuse as outside domain',
  },
  {
    id: 13,
    label: 'LANGUAGE — Hindi question, must respond in Hindi',
    question: "मेरे पिता का देहांत हो गया है और मुझे बहुत दुख है। मैं क्या करूँ?",
    expectedBehavior: 'must respond in Hindi/Devanagari, address grief, cite from texts',
  },
]

// ── Scorer ────────────────────────────────────────────────────────────────────
function scoreResponse(text: string, q: typeof QUESTIONS[0]): {
  total: number; maxTotal: number; notes: string[]
} {
  const lower = text.toLowerCase()
  const notes: string[] = []
  let total = 0
  const max = 10

  const isTrivial = q.id === 11
  const isPlayful = q.id === 12
  const isHindi = q.id === 13

  // Citation regex (handles word-form ordinals)
  const ordinals = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth'
  const chapterVerseRe = new RegExp(
    `chapter (?:\\d+|${ordinals})|(?:${ordinals}|\\d+) chapter|skandha (?:\\d+|${ordinals})|(?:${ordinals}) skandha|verse (?:\\d+|${ordinals})|\\d+\\.\\d+`,
    'i'
  )
  const hasChapterVerse = chapterVerseRe.test(lower)
  const hasTextName = /bhagavatam|gita|upanishad|yoga sutra/.test(lower)
  const hasGenericCitation = hasChapterVerse || hasTextName

  // Closing question check (handles markdown bold/italic)
  const hasFollowUp = /\?/.test(text.trim().slice(-300))

  // Word count
  const words = text.trim().split(/\s+/).length

  // Devanagari script check for Hindi response
  const hasDevanagari = /[ऀ-ॿ]/.test(text)

  if (isTrivial) {
    // Trivial: SHOULDN'T cite, SHOULD be brief, no follow-up required
    if (!hasGenericCitation) { total += 4; notes.push('✓ No scripture citation (correct)') }
    else notes.push('✗ Cited scripture for trivial question')
    if (words < 100) { total += 3; notes.push('✓ Brief response') }
    else if (words < 200) { total += 2; notes.push('⚠ Slightly long for trivial') }
    else notes.push('✗ Too long for trivial')
    if (!/grihastha|vanaprastha|brahmacharya|sannyasa|ashrama/.test(lower)) { total += 3; notes.push('✓ No forced ashrama') }
    else notes.push('✗ Forced ashrama on trivial question')
  } else if (isPlayful) {
    // Playful: should engage, NOT refuse
    const refusalPhrases = ['cannot provide', 'beyond the domain', 'contact a lawyer', 'qualified professional', 'consult a financial', 'outside my domain']
    const isRefusal = refusalPhrases.some(p => lower.includes(p))
    if (!isRefusal) { total += 5; notes.push('✓ Engaged the question, no refusal') }
    else { notes.push('✗ Refused playful question') }
    // Should reference Gita teachings on non-attachment / desire / outcomes — accept paraphrased forms
    const hasRelevantTeaching = /attach|fruit of action|outcome|desire|nishkama|equanim|detach|skill|steady|present|chasing|clear-head|calm|let go|not.{0,8}cling/.test(lower)
    if (hasRelevantTeaching) { total += 3; notes.push('✓ Connected to relevant teaching') }
    else { notes.push('✗ Missed the teaching connection') }
    if (words >= 80 && words <= 400) { total += 2; notes.push('✓ Appropriate length') }
    else notes.push(`⚠ Length ${words} words (want 80-400)`)
  } else if (isHindi) {
    // Hindi: must respond in Devanagari
    if (hasDevanagari) {
      const devanagariRatio = (text.match(/[ऀ-ॿ]/g) || []).length / text.length
      if (devanagariRatio > 0.3) { total += 6; notes.push(`✓ Hindi response (${Math.round(devanagariRatio*100)}% devanagari)`) }
      else { total += 3; notes.push(`⚠ Mixed language (only ${Math.round(devanagariRatio*100)}% devanagari)`) }
    } else { notes.push('✗ Responded in English to Hindi question') }
    if (words >= 50) { total += 2; notes.push('✓ Substantive') }
    if (hasGenericCitation) { total += 2; notes.push('✓ Cited text') }
  } else {
    // Standard questions: full rubric (citation, ashrama, follow-up, depth)
    if (hasChapterVerse) total += 2
    else if (hasTextName) total += 1
    if (!hasChapterVerse) notes.push('Missing chapter/verse citation')

    // Normalize diacritics so "gṛhastha" and "gr̥hastha" both match "grihastha"
    const normalized = lower.normalize('NFD').replace(/[̀-ͯ]/g, '')
    const ashramaTerms = ['vanaprastha', 'grihastha', 'gr hastha', 'brahmacharya', 'sannyasa', 'householder', 'renunciant', 'ashrama', 'asrama', 'life stage']
    const ashramaHits = ashramaTerms.filter(a => normalized.includes(a) || lower.includes(a)).length
    total += ashramaHits >= 2 ? 2 : ashramaHits === 1 ? 1 : 0
    if (ashramaHits === 0) notes.push('No ashrama identified')

    if (words >= 200) total += 2
    else if (words >= 100) total += 1
    if (words < 200) notes.push(`Short (${words} words)`)

    if (hasFollowUp) total += 2
    else notes.push('No closing question')

    const genericPhrases = ['follow your heart', 'trust yourself', 'do what feels right']
    const isGeneric = genericPhrases.some(p => lower.includes(p))
    if (!isGeneric) total += 2
    else notes.push('Generic self-help phrase used')
  }

  return { total: Math.min(total, max), maxTotal: max, notes }
}

// ── Supabase / retrieval ──────────────────────────────────────────────────────
function makeSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

async function embedQuery(text: string): Promise<number[]> {
  const genai = new GoogleGenerativeAI(GEMINI_KEY)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = genai.getGenerativeModel({ model: 'gemini-embedding-001' }) as any
  const result = await model.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIM,
  })
  return result.embedding.values
}

async function vectorSearch(embedding: number[], supabase: ReturnType<typeof makeSupabase>, topN = 8) {
  const { data, error } = await supabase.rpc('match_corpus', {
    query_embedding: embedding, match_count: topN,
  })
  if (error) console.error('  [match_corpus]', error.message)
  return (data ?? []) as Array<{ text_source: string; book_chapter: number; verse: number; text: string; similarity: number }>
}

const STOP_WORDS = new Set(['the','a','an','is','it','in','on','of','to','and','or','but','for','with','my','i','am','me','do','be','have','that','this','are','was','at','by','as','so','if','not','can','you','we','he','she','they','what','why','how','who','when','where','will','would','could','should','did','has','had','its'])
function extractKeywords(message: string): string[] {
  return message.toLowerCase().split(/\W+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w))
}

type LookupResult = { id: number; label: string; intent_keywords: string[]; text_source: string; book_chapter: number; verse_start: number; verse_end: number }
async function structuralLookup(keywords: string[], supabase: ReturnType<typeof makeSupabase>): Promise<LookupResult[]> {
  if (keywords.length === 0) return []
  const { data } = await supabase.from('structural_lookup').select('*').overlaps('intent_keywords', keywords)
  return (data ?? []) as LookupResult[]
}

function formatRef(source: string, bookChapter: number, verse: number): string {
  if (source === 'srimad_bhagavatam' && bookChapter >= 1000) {
    const sk = Math.floor(bookChapter / 1000); const ch = bookChapter % 1000
    return `srimad_bhagavatam Skandha ${sk} Chapter ${ch} verse ${verse}`
  }
  if (source === 'bhagavad_gita') return `bhagavad_gita chapter ${bookChapter} verse ${verse}`
  return `${source} ${bookChapter}.${verse}`
}

// ── DeepSeek ──────────────────────────────────────────────────────────────────
type UsageData = { prompt_tokens: number; completion_tokens: number; prompt_cache_hit_tokens?: number }

async function callDeepSeek(deepseek: OpenAI, systemPrompt: string, contextBlock: string, anchorBlock: string, userMessage: string): Promise<{ content: string; usage: UsageData; latencyMs: number }> {
  const fullContext = [anchorBlock, contextBlock].filter(Boolean).join('\n')
  const t0 = Date.now()
  const completion = await deepseek.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `--- Retrieved context ---\n${fullContext}\n--- End context ---\n\nSeeker: ${userMessage}\nYogi:` },
    ],
    stream: false, max_tokens: 4096,
  })
  return { content: completion.choices[0]?.message?.content ?? '', usage: completion.usage as UsageData, latencyMs: Date.now() - t0 }
}

function calcCost(usage: UsageData): number {
  const cacheHit = usage.prompt_cache_hit_tokens ?? 0
  const cacheMiss = (usage.prompt_tokens ?? 0) - cacheHit
  return (cacheMiss / 1e6) * PRICE_INPUT_PER_M + (cacheHit / 1e6) * PRICE_CACHE_HIT_PER_M + ((usage.completion_tokens ?? 0) / 1e6) * PRICE_OUTPUT_PER_M
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const now = new Date()
  const dateStr = now.toISOString().replace('T', '-').replace(/:/g, '').slice(0, 15)
  const outDir = join(process.cwd(), 'evals')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `compare-${dateStr}.md`)

  console.log('\n=== Krishna AI Prompt Comparison ===')
  console.log(`Model: ${MODEL}`)
  console.log(`Questions: ${QUESTIONS.length} × 2 prompts = ${QUESTIONS.length * 2} requests\n`)

  const deepseek = new OpenAI({ apiKey: DEEPSEEK_KEY, baseURL: 'https://api.deepseek.com/v1' })
  const supabase = makeSupabase()

  const lines: string[] = [
    `# System Prompt Comparison: v1 vs v2`,
    ``,
    `**Date:** ${now.toUTCString()}  `,
    `**Model:** ${MODEL}  `,
    `**Questions:** ${QUESTIONS.length} standard + 3 stress tests (trivial, playful, Hindi)`,
    ``,
    `---`,
    ``,
    `## Summary Table`,
    ``,
    `| # | Question | v1 Score | v2 Score | Δ | Notes |`,
    `|---|---|---|---|---|---|`,
  ]

  let totalCost = 0
  type Row = {
    id: number; label: string
    v1: number; v2: number; v1Notes: string[]; v2Notes: string[]
    v1Response: string; v2Response: string
    v1Words: number; v2Words: number
    v1LatencyMs: number; v2LatencyMs: number
  }
  const rows: Row[] = []

  for (const q of QUESTIONS) {
    console.log(`\n[Q${q.id}] ${q.label}`)

    // Retrieve once, reuse for both prompts
    const keywords = extractKeywords(q.question)
    const [embedding, anchors] = await Promise.all([embedQuery(q.question), structuralLookup(keywords, supabase)])
    const sources = await vectorSearch(embedding, supabase)
    const contextBlock = sources.map((s, i) => `[${i + 1}] ${formatRef(s.text_source, s.book_chapter, s.verse)}: ${s.text}`).join('\n')
    const anchorBlock = anchors.length > 0 ? anchors.map(a => `[Anchor] ${a.label} (${a.text_source} ${a.book_chapter}:${a.verse_start}-${a.verse_end})`).join('\n') : ''
    console.log(`  Retrieved ${sources.length} verses, ${anchors.length} anchors`)

    process.stdout.write('  v1...')
    const r1 = await callDeepSeek(deepseek, SYSTEM_PROMPT_V1, contextBlock, anchorBlock, q.question)
    process.stdout.write(` ${r1.latencyMs}ms  v2...`)
    const r2 = await callDeepSeek(deepseek, SYSTEM_PROMPT_V2, contextBlock, anchorBlock, q.question)
    process.stdout.write(` ${r2.latencyMs}ms\n`)

    const s1 = scoreResponse(r1.content, q)
    const s2 = scoreResponse(r2.content, q)
    totalCost += calcCost(r1.usage) + calcCost(r2.usage)

    rows.push({
      id: q.id, label: q.label,
      v1: s1.total, v2: s2.total,
      v1Notes: s1.notes, v2Notes: s2.notes,
      v1Response: r1.content, v2Response: r2.content,
      v1Words: r1.content.trim().split(/\s+/).length,
      v2Words: r2.content.trim().split(/\s+/).length,
      v1LatencyMs: r1.latencyMs, v2LatencyMs: r2.latencyMs,
    })

    const delta = s2.total - s1.total
    const deltaStr = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '0'
    console.log(`  v1: ${s1.total}/10  v2: ${s2.total}/10  Δ${deltaStr}`)
    lines.push(`| Q${q.id} | ${q.label.slice(0, 40)} | ${s1.total}/10 | ${s2.total}/10 | ${deltaStr} | ${s1.total !== s2.total ? '**different**' : 'same'} |`)
  }

  // Detailed side-by-side
  lines.push(``, `---`, ``, `## Detailed Comparison (side-by-side responses)`, ``)
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i]
    const row = rows[i]
    lines.push(`### Q${q.id}: ${q.label}`)
    lines.push(``)
    lines.push(`**Question:** ${q.question}`)
    lines.push(``)
    lines.push(`**Expected behavior:** ${q.expectedBehavior}`)
    lines.push(``)
    lines.push(`#### v1 — score ${row.v1}/10, ${row.v1Words} words, ${row.v1LatencyMs}ms`)
    lines.push(``)
    lines.push(row.v1Response || '*(empty)*')
    lines.push(``)
    lines.push(`*Scorer notes:* ${row.v1Notes.join(' · ') || 'none'}`)
    lines.push(``)
    lines.push(`#### v2 — score ${row.v2}/10, ${row.v2Words} words, ${row.v2LatencyMs}ms`)
    lines.push(``)
    lines.push(row.v2Response || '*(empty)*')
    lines.push(``)
    lines.push(`*Scorer notes:* ${row.v2Notes.join(' · ') || 'none'}`)
    lines.push(``)
    lines.push(`---`)
    lines.push(``)
  }

  const scores = rows

  // Simple averages
  const v1Avg = scores.reduce((a, s) => a + s.v1, 0) / scores.length
  const v2Avg = scores.reduce((a, s) => a + s.v2, 0) / scores.length

  lines.push(``)
  lines.push(`## Aggregate`)
  lines.push(``)
  lines.push(`| Metric | v1 | v2 |`)
  lines.push(`|---|---|---|`)
  lines.push(`| Average score | ${v1Avg.toFixed(2)}/10 | ${v2Avg.toFixed(2)}/10 |`)
  lines.push(`| Wins (v2 > v1) | — | ${scores.filter(s => s.v2 > s.v1).length} |`)
  lines.push(`| Ties | — | ${scores.filter(s => s.v2 === s.v1).length} |`)
  lines.push(`| Losses (v2 < v1) | — | ${scores.filter(s => s.v2 < s.v1).length} |`)
  lines.push(`| Total cost (both prompts) | — | $${totalCost.toFixed(5)} |`)

  writeFileSync(outPath, lines.join('\n'))
  console.log(`\n=== Done ===`)
  console.log(`v1 avg: ${v1Avg.toFixed(2)}/10`)
  console.log(`v2 avg: ${v2Avg.toFixed(2)}/10`)
  console.log(`Total cost: $${totalCost.toFixed(5)}`)
  console.log(`Written to: ${outPath}`)
}

main().catch(console.error)
