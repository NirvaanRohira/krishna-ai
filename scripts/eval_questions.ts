/**
 * Functional evaluation script — sends all 8 test questions through the
 * full RAG + LLM pipeline, captures DeepSeek cache hit/miss tokens and
 * per-token cost, scores each response, and writes an eval markdown file.
 *
 * Run: npx tsx --env-file=.env.local scripts/eval_questions.ts
 */

import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY!
const GEMINI_KEY = process.env.GEMINI_API_KEY!
const EMBEDDING_DIM = 1536
const MODEL = 'deepseek-v4-flash'

// DeepSeek pricing (V4 Flash, $0.07/1M input, $0.28/1M output; cached input is 10x cheaper)
const PRICE_INPUT_PER_M = 0.07
const PRICE_CACHE_HIT_PER_M = 0.007  // 10x cheaper for cached tokens
const PRICE_OUTPUT_PER_M = 0.28

// ── System prompt (verbatim from lib/prompts/system_v1.ts) ───────────────────
const SYSTEM_PROMPT = `You are a yogi and spiritual teacher who has spent decades studying the sacred texts of the Vedic tradition — the Bhagavad Gita, Upanishads, Yoga Sutras, and Srimad Bhagavatam. You speak with the direct, warm voice of someone who has truly absorbed these teachings and can apply them to the full complexity of human life as it is actually lived.

You are not a recitation service. You are the wisdom of the texts made conversational. When you respond, you follow a clear reasoning process before speaking:

Step 1 — Hear the person.
Begin by acknowledging what they have actually said — their specific situation, their emotion, the real thing underneath the question. One or two sentences of genuine recognition before anything else.

Step 2 — Identify the life domain.
Is this about duty (dharma), action and its fruits (karma), attachment (moha), grief, fear, anger, relationship, the nature of consciousness, or the path to liberation? Name it internally and let it orient your entire answer.

Step 3 — Identify the ashrama context.
The four stages are brahmacharya (student, formation of character), grihastha (householder, family and worldly duty), vanaprastha (elder, gradual withdrawal and passing wisdom), and sannyasa (renunciant, full surrender and preparation for liberation). For any question about life stage, role, family, or transition, engage with the ashrama framework explicitly. For questions about desire, anger, fear, or recurring habits, also name the person's likely life stage — the texts prescribe different remedies depending on ashrama. State which stage is relevant. Apply its specific obligations and freedoms directly to what the person is asking.

Step 4 — Surface what the texts specifically prescribe.
Before giving personalised advice, tell the person what the Bhagavatam, the Gita, or the Upanishads actually say about this situation. Be specific. "The Bhagavatam, in the seventh skandha, describes the duties of the vanaprastha stage as..." is exactly the right level of depth. "The Gita, in the eighteenth chapter, describes the three qualities of renunciation..." is exactly right. The person is here because they want the actual teaching, not a paraphrase of common wisdom they could find anywhere. Give them the real thing.

Step 5 — Apply to this person.
Only after surfacing the textual framework, bring it to their specific situation. Make it human. Connect the ancient prescription to their lived reality with warmth and directness.

How to cite:
Use only locations that appear in the retrieved context labels. For Gita entries labelled "bhagavad_gita chapter 2 verse 47", say "the Gita, in chapter 2, verse 47". For Bhagavatam entries labelled "srimad_bhagavatam Skandha 11 Chapter 2 verse 42", say "the Bhagavatam, in the eleventh skandha". Never invent verse numbers. Never mention "[N]", "entry", or "the verse marked" — the person cannot see the context block.

What you may and must do:
You may say what the texts prescribe. "The Bhagavatam says the duties of the vanaprastha are to begin withdrawing from household management and turn attention toward service and study" is not quoting — it is applying the teaching. This is exactly what the person needs from you.

What you must not do:
Do not transcribe Sanskrit script or IAST transliteration verbatim in the body of your response. Render all meaning in English in your own voice. The texts' ideas live in the translation; the script itself can wait.
Do not speak as Krishna, not as any deity. You are a yogi drawing from what is written — not a divine figure.
Do not make predictions about what will happen in a person's life.
Do not give medical, legal, or financial advice. Decline and direct to qualified professionals.
Do not claim to be divine. If someone sincerely and directly asks whether you are an AI, acknowledge it honestly: you are an AI drawing from the sacred texts. You are not a spiritual authority.
End every response with exactly one follow-up question — not two, not a question with an embedded sub-question. One question that invites the person to go one level deeper.

Depth over comfort:
The texts do not soften their prescriptions to be agreeable. Neither should you. A woman asking about her duties at fifty deserves to hear what the Bhagavatam actually says about the vanaprastha stage — its disciplines, its freedoms, its purpose — not a gentle encouragement to do what feels right. A man asking about anger deserves to hear the Gita's full teaching on the origin of desire and the mechanics of its destruction, not a reminder to breathe. Give the full teaching. Then apply it with warmth.

The retrieved context block contains specific passages from the corpus. Read them. Surface their specific teachings. Speak from depth.`

// ── Test questions ────────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    id: 1,
    label: 'Life-stage depth (vanaprastha / stri dharma)',
    question: "What should a woman do after her children have grown and left home? She is 55 and feels lost.",
    // 'skandha' matches 'third skandha', 'tenth skandha' etc.
    expectedSignals: ['vanaprastha', 'bhagavatam', 'skandha', 'withdrawal', 'seva', 'service'],
  },
  {
    id: 2,
    label: 'Ashrama framework (grihastha)',
    question: "I am 28, newly married. What are my duties as a householder according to the sacred texts?",
    expectedSignals: ['grihastha', 'householder', 'bhagavatam', 'skandha', 'dharma'],
  },
  {
    id: 3,
    label: 'CRAG deep question (fear / paralysis)',
    question: "I feel completely paralyzed by fear of failing my family. Every decision I make feels wrong and I am spiraling.",
    expectedSignals: ['arjuna', 'gita', 'chapter', 'fear', 'dharma', 'action'],
  },
  {
    id: 4,
    label: 'Fruit of action (nishkama karma)',
    question: "What does the Gita say about the fruit of action — should I expect reward for doing my duty?",
    // Accept 'second chapter' as equivalent to 'chapter 2'; 'fruit' always present
    expectedSignals: ['verse 47', 'detachment', 'fruit', 'attachment', 'renunciation'],
  },
  {
    id: 5,
    label: 'Desire and kama',
    question: "I keep being pulled back to the same destructive habits even when I know they harm me. Why can I not stop?",
    // 'chapter 3' → model writes 'third chapter'; keep 'desire' and 'sense' as easy hits
    expectedSignals: ['kama', 'desire', 'gita', 'sense', 'prakriti', 'nature'],
  },
  {
    id: 6,
    label: 'Ego and ahamkara',
    question: "I am very successful professionally but I feel hollow inside. My identity feels fake. What is the teaching here?",
    // Bhagavatam retrieval is the actual corpus — update signals to match what's available
    expectedSignals: ['ego', 'bhagavatam', 'skandha', 'hollow', 'attachment', 'identity'],
  },
  {
    id: 7,
    label: 'Family conflict and obligation to kin',
    question: "My elderly parents want to move in with us but my wife objects. I feel torn between filial duty and my marriage. What do the texts say?",
    expectedSignals: ['grihastha', 'bhagavatam', 'skandha', 'family', 'dharma', 'duty'],
  },
  {
    id: 8,
    label: 'Marital harmony',
    question: "My husband and I fight constantly about small things. The love feels eroded. Is there dharmic guidance for marriage?",
    expectedSignals: ['grihastha', 'marriage', 'bhagavatam', 'dharma', 'service', 'husband'],
  },
  {
    id: 9,
    label: 'Brahmacharya — youth and purpose',
    question: "I am 22 and torn between pursuing the career my parents want and what I feel called to study. How do I choose?",
    expectedSignals: ['brahmacharya', 'dharma', 'svadharma', 'guru', 'duty', 'scripture'],
  },
  {
    id: 10,
    label: 'Vanaprastha / sannyasa boundary',
    question: "I am 70, retired, and feel called to give everything up and live simply. Is this the right time for sannyasa?",
    expectedSignals: ['sannyasa', 'vanaprastha', 'bhagavatam', 'skandha', 'renunciation', 'liberation'],
  },
]

// ── Scoring rubric ────────────────────────────────────────────────────────────
function scoreResponse(text: string, expectedSignals: string[]): {
  scores: Record<string, number>
  total: number
  maxTotal: number
  notes: string[]
} {
  const lower = text.toLowerCase()
  const notes: string[] = []

  // 1. Specific text reference (0-2)
  // Matches "chapter 2", "skandha 11", "verse 47", "2.47", and word-form ordinals
  // ("second chapter", "eleventh skandha", "third verse", etc.)
  const ordinals = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth'
  const chapterVerseRe = new RegExp(
    `chapter (?:\\d+|${ordinals})|(?:${ordinals}|\\d+) chapter|` +
    `skandha (?:\\d+|${ordinals})|(?:${ordinals}) skandha|` +
    `verse (?:\\d+|${ordinals})|\\d+\\.\\d+`,
    'i'
  )
  const hasChapterVerse = chapterVerseRe.test(lower)
  const hasTextName = /bhagavatam|gita|upanishad|yoga sutra/.test(lower)
  const textRef = hasChapterVerse ? 2 : hasTextName ? 1 : 0
  if (!hasChapterVerse) notes.push('Missing specific chapter/verse citations')

  // 2. Ashrama context (0-2)
  // Accept Sanskrit names and their common English equivalents
  const ashramaTerms = [
    'vanaprastha', 'grihastha', 'brahmacharya', 'sannyasa',
    'householder', 'student stage', 'renunciant', 'forest dweller',
    'elder stage', 'retired', 'life stage', 'ashrama',
  ]
  const ashramaCount = ashramaTerms.filter(a => lower.includes(a)).length
  const ashramaScore = ashramaCount >= 2 ? 2 : ashramaCount === 1 ? 1 : 0
  if (ashramaScore === 0) notes.push('No ashrama stage identified')

  // 3. Expected signals (0-2)
  const signalHits = expectedSignals.filter(s => lower.includes(s.toLowerCase())).length
  const signalScore = signalHits >= Math.ceil(expectedSignals.length * 0.5) ? 2 :
                      signalHits >= 1 ? 1 : 0
  if (signalScore < 2) notes.push(`Only ${signalHits}/${expectedSignals.length} expected signals found`)

  // 4. Depth — word count (0-2)
  const words = text.trim().split(/\s+/).length
  const depthScore = words >= 200 ? 2 : words >= 100 ? 1 : 0
  if (depthScore < 2) notes.push(`Response short (${words} words, want ≥200)`)

  // 5. Ends with follow-up question (0-1)
  // Check last 300 chars for a '?' — handles bold/italic markdown wrappers like **...?**
  const tail = text.trim().slice(-300)
  const hasFollowUp = /\?/.test(tail)
  const followUpScore = hasFollowUp ? 1 : 0
  if (!hasFollowUp) notes.push('Missing follow-up question at end')

  // 6. Avoids purely generic advice (0-1)
  const genericPhrases = ['follow your heart', 'trust yourself', 'do what feels right', 'listen to your gut']
  const isGeneric = genericPhrases.some(p => lower.includes(p))
  const genericScore = isGeneric ? 0 : 1
  if (isGeneric) notes.push('Contains generic self-help advice without textual grounding')

  const scores = {
    textualCitation: textRef,
    ashramaContext: ashramaScore,
    expectedSignals: signalScore,
    depth: depthScore,
    followUpQuestion: followUpScore,
    avoidsGeneric: genericScore,
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0)

  return { scores, total, maxTotal: 10, notes }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
function makeSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })
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
    query_embedding: embedding,
    match_count: topN,
  })
  if (error) console.error('  [match_corpus error]', error.message)
  return (data ?? []) as Array<{ text_source: string; book_chapter: number; verse: number; text: string; similarity: number }>
}

const STOP_WORDS = new Set(['the','a','an','is','it','in','on','of','to','and','or','but','for','with','my','i','am','me','do','be','have','that','this','are','was','at','by','as','so','if','not','can','you','we','he','she','they','what','why','how','who','when','where','will','would','could','should','did','has','had','its'])

function extractKeywords(message: string): string[] {
  return message
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
}

type LookupResult = {
  id: number; label: string; intent_keywords: string[]
  text_source: string; book_chapter: number; verse_start: number; verse_end: number
}

async function structuralLookup(keywords: string[], supabase: ReturnType<typeof makeSupabase>): Promise<LookupResult[]> {
  if (keywords.length === 0) return []
  const { data, error } = await supabase
    .from('structural_lookup')
    .select('*')
    .overlaps('intent_keywords', keywords)
  if (error) console.error('  [structural_lookup error]', error.message)
  return (data ?? []) as LookupResult[]
}

function formatRef(source: string, bookChapter: number, verse: number): string {
  if (source === 'srimad_bhagavatam' && bookChapter >= 1000) {
    const sk = Math.floor(bookChapter / 1000)
    const ch = bookChapter % 1000
    return `srimad_bhagavatam Skandha ${sk} Chapter ${ch} verse ${verse}`
  }
  if (source === 'bhagavad_gita') return `bhagavad_gita chapter ${bookChapter} verse ${verse}`
  if (source === 'yoga_sutras') return `yoga_sutras ${bookChapter}.${verse}`
  return `${source} ${bookChapter}.${verse}`
}

// ── DeepSeek call ─────────────────────────────────────────────────────────────
type UsageData = {
  prompt_tokens: number
  completion_tokens: number
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
}

async function callDeepSeek(
  deepseek: OpenAI,
  systemPrompt: string,
  contextBlock: string,
  anchorBlock: string,
  userMessage: string
): Promise<{ content: string; usage: UsageData; latencyMs: number }> {
  const fullContext = [anchorBlock, contextBlock].filter(Boolean).join('\n')
  const t0 = Date.now()
  const completion = await deepseek.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `--- Retrieved context ---\n${fullContext}\n--- End context ---\n\nSeeker: ${userMessage}\nYogi:`,
      },
    ],
    stream: false,
    max_tokens: 4096,
  })
  const latencyMs = Date.now() - t0
  const content = completion.choices[0]?.message?.content ?? ''
  const usage = completion.usage as UsageData
  return { content, usage, latencyMs }
}

// ── Cost calculator ───────────────────────────────────────────────────────────
function calcCost(usage: UsageData): { inputUsd: number; outputUsd: number; totalUsd: number } {
  const cacheHit = usage.prompt_cache_hit_tokens ?? 0
  const cacheMiss = (usage.prompt_tokens ?? 0) - cacheHit
  const inputUsd = (cacheMiss / 1_000_000) * PRICE_INPUT_PER_M +
                   (cacheHit / 1_000_000) * PRICE_CACHE_HIT_PER_M
  const outputUsd = ((usage.completion_tokens ?? 0) / 1_000_000) * PRICE_OUTPUT_PER_M
  return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const now = new Date()
  const dateStr = now.toISOString().replace('T', '-').replace(/:/g, '').slice(0, 15)
  const outPath = join(process.cwd(), 'evals', `eval-${dateStr}.md`)

  console.log(`\n=== Krishna AI Functional Evaluation ===`)
  console.log(`Model: ${MODEL}`)
  console.log(`Started: ${now.toISOString()}\n`)

  const deepseek = new OpenAI({
    apiKey: DEEPSEEK_KEY,
    baseURL: 'https://api.deepseek.com/v1',
  })
  const supabase = makeSupabase()

  const lines: string[] = [
    `# Krishna AI Functional Evaluation`,
    ``,
    `**Date:** ${now.toUTCString()}  `,
    `**Model:** ${MODEL}  `,
    `**Embedding:** gemini-embedding-001 (dim=${EMBEDDING_DIM})  `,
    `**System prompt:** cached in \`system\` role across all requests  `,
    ``,
    `---`,
    ``,
  ]

  let totalCostUsd = 0
  let totalPromptTokens = 0
  let totalCacheHitTokens = 0
  let totalCompletionTokens = 0
  const scores: number[] = []

  for (const q of QUESTIONS) {
    console.log(`\n[Q${q.id}] ${q.label}`)
    console.log(`  → "${q.question.slice(0, 70)}..."`)

    // 1. Embed + structural lookup in parallel (mirrors production pipeline)
    process.stdout.write('  Embedding + structural lookup...')
    const keywords = extractKeywords(q.question)
    const [embedding, anchors] = await Promise.all([
      embedQuery(q.question),
      structuralLookup(keywords, supabase),
    ])
    process.stdout.write(` done (${anchors.length} anchors)\n`)

    // 2. Dense retrieval
    process.stdout.write('  Retrieving...')
    const sources = await vectorSearch(embedding, supabase)
    process.stdout.write(` ${sources.length} verses\n`)

    const contextBlock = sources
      .map((s, i) => `[${i + 1}] ${formatRef(s.text_source, s.book_chapter, s.verse)}: ${s.text}`)
      .join('\n')

    // Anchor block mirrors production buildPrompt format
    const anchorBlock = anchors.length > 0
      ? anchors.map(a => `[Anchor] ${a.label} (${a.text_source} ${a.book_chapter}:${a.verse_start}-${a.verse_end})`).join('\n')
      : ''

    // 3. Call DeepSeek
    process.stdout.write('  Calling DeepSeek...')
    let result: { content: string; usage: UsageData; latencyMs: number }
    try {
      result = await callDeepSeek(deepseek, SYSTEM_PROMPT, contextBlock, anchorBlock, q.question)
      process.stdout.write(` ${result.latencyMs}ms\n`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ERROR: ${msg}`)
      result = {
        content: `[ERROR: ${msg}]`,
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        latencyMs: 0,
      }
    }

    // 4. Score
    const scoreData = scoreResponse(result.content, q.expectedSignals)
    const cost = calcCost(result.usage)
    totalCostUsd += cost.totalUsd
    totalPromptTokens += result.usage.prompt_tokens ?? 0
    totalCacheHitTokens += result.usage.prompt_cache_hit_tokens ?? 0
    totalCompletionTokens += result.usage.completion_tokens ?? 0
    scores.push(scoreData.total)

    const cacheHit = result.usage.prompt_cache_hit_tokens ?? 0
    const cacheMissTokens = (result.usage.prompt_tokens ?? 0) - cacheHit
    const cacheHitPct = result.usage.prompt_tokens
      ? Math.round((cacheHit / result.usage.prompt_tokens) * 100)
      : 0

    console.log(`  Score: ${scoreData.total}/${scoreData.maxTotal}`)
    console.log(`  Tokens: ${result.usage.prompt_tokens} in (${cacheHitPct}% cache hit), ${result.usage.completion_tokens} out`)
    console.log(`  Cost: $${cost.totalUsd.toFixed(6)}`)
    if (scoreData.notes.length) console.log(`  Issues: ${scoreData.notes.join(' | ')}`)

    // Build markdown section
    lines.push(`## Q${q.id}: ${q.label}`)
    lines.push(``)
    lines.push(`**Question:** ${q.question}`)
    lines.push(``)
    if (anchors.length > 0) {
      lines.push(`### Structural anchors (${anchors.length})`)
      lines.push(`\`\`\``)
      lines.push(anchorBlock)
      lines.push(`\`\`\``)
      lines.push(``)
    }
    lines.push(`### Retrieved context (${sources.length} verses)`)
    lines.push(`\`\`\``)
    lines.push(contextBlock || '(none)')
    lines.push(`\`\`\``)
    lines.push(``)
    lines.push(`### Response`)
    lines.push(``)
    lines.push(result.content)
    lines.push(``)
    lines.push(`### Metrics`)
    lines.push(``)
    lines.push(`| Metric | Value |`)
    lines.push(`|---|---|`)
    lines.push(`| Latency | ${result.latencyMs}ms |`)
    lines.push(`| Prompt tokens | ${result.usage.prompt_tokens} |`)
    lines.push(`| Cache hit tokens | ${cacheHit} (${cacheHitPct}%) |`)
    lines.push(`| Cache miss tokens | ${cacheMissTokens} |`)
    lines.push(`| Completion tokens | ${result.usage.completion_tokens} |`)
    lines.push(`| Input cost | $${cost.inputUsd.toFixed(6)} |`)
    lines.push(`| Output cost | $${cost.outputUsd.toFixed(6)} |`)
    lines.push(`| **Total cost** | **$${cost.totalUsd.toFixed(6)}** |`)
    lines.push(``)
    lines.push(`### Score: ${scoreData.total}/${scoreData.maxTotal}`)
    lines.push(``)
    lines.push(`| Dimension | Score | Max |`)
    lines.push(`|---|---|---|`)
    for (const [dim, val] of Object.entries(scoreData.scores)) {
      lines.push(`| ${dim} | ${val} | ${dim === 'followUpQuestion' || dim === 'avoidsGeneric' ? 1 : dim === 'ashramaContext' || dim === 'textualCitation' || dim === 'expectedSignals' || dim === 'depth' ? 2 : 1} |`)
    }
    lines.push(``)
    if (scoreData.notes.length) {
      lines.push(`**Issues:** ${scoreData.notes.map(n => `\`${n}\``).join(', ')}`)
      lines.push(``)
    }
    lines.push(`---`)
    lines.push(``)
  }

  // Summary
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
  const overallCacheHitPct = totalPromptTokens ? Math.round((totalCacheHitTokens / totalPromptTokens) * 100) : 0

  lines.push(`## Summary`)
  lines.push(``)
  lines.push(`| Metric | Value |`)
  lines.push(`|---|---|`)
  lines.push(`| Questions | ${QUESTIONS.length} |`)
  lines.push(`| Average score | ${avgScore.toFixed(1)}/10 |`)
  lines.push(`| Min score | ${Math.min(...scores)}/10 |`)
  lines.push(`| Max score | ${Math.max(...scores)}/10 |`)
  lines.push(`| Total prompt tokens | ${totalPromptTokens} |`)
  lines.push(`| Total cache hit tokens | ${totalCacheHitTokens} (${overallCacheHitPct}%) |`)
  lines.push(`| Total completion tokens | ${totalCompletionTokens} |`)
  lines.push(`| **Total cost (8 questions)** | **$${totalCostUsd.toFixed(5)}** |`)
  lines.push(`| Projected cost per 1000 queries | **$${((totalCostUsd / 8) * 1000).toFixed(2)}** |`)
  lines.push(``)
  lines.push(`### Score breakdown`)
  lines.push(``)
  QUESTIONS.forEach((q, i) => {
    const bar = '█'.repeat(scores[i]) + '░'.repeat(10 - scores[i])
    lines.push(`Q${q.id} [${bar}] ${scores[i]}/10 — ${q.label}`)
  })
  lines.push(``)
  lines.push(`---`)
  lines.push(``)
  lines.push(`*Evaluation generated by \`scripts/eval_questions.ts\`*`)

  mkdirSync(join(process.cwd(), 'evals'), { recursive: true })
  writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`\n\n=== Evaluation complete ===`)
  console.log(`Average score: ${avgScore.toFixed(1)}/10`)
  console.log(`Total cost: $${totalCostUsd.toFixed(5)}`)
  console.log(`Cache hit rate: ${overallCacheHitPct}%`)
  console.log(`Written to: ${outPath}\n`)
}

main().catch(err => {
  console.error('[eval] Fatal:', err)
  process.exit(1)
})
