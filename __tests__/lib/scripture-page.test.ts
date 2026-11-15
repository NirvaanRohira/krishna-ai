import { describe, it, expect } from 'vitest'
import { splitReply, parseRef, refLabel, refInSources, toSpeech, hasPage } from '@/lib/scripture-page'

const REPLY = `So it isn't duty against desire.
<page ref="bhagavad_gita chapter 3 verse 35" title="Your own path">
<moment>Arjuna wanted to lay down his bow.</moment>
<teaching>Better one's own dharma, imperfectly, than another's done well.</teaching>
<life>Tell your father what your path is.</life>
<practice>Write one sentence tonight.</practice>
</page>
What would that sentence be?`

describe('scripture page markup', () => {
  it('splits text, page and closing question', () => {
    const segs = splitReply(REPLY)
    expect(segs.map((s) => s.kind)).toEqual(['text', 'page', 'text'])
    const page = segs[1].kind === 'page' ? segs[1].page : null
    expect(page).toMatchObject({ ref: 'bhagavad_gita chapter 3 verse 35', title: 'Your own path', complete: true })
    expect(page?.practice).toBe('Write one sentence tonight.')
  })

  it('renders a half-streamed page without leaking partial tags', () => {
    const partial = REPLY.slice(0, REPLY.indexOf('</teaching>') + 4)
    const segs = splitReply(partial)
    const page = segs[1].kind === 'page' ? segs[1].page : null
    expect(page?.complete).toBe(false)
    expect(page?.teaching).not.toMatch(/</)
    expect(splitReply('Hello <pa').map((s) => (s.kind === 'text' ? s.text : ''))).toEqual(['Hello'])
  })

  it('reads references from both corpora and labels them', () => {
    expect(parseRef('srimad_bhagavatam Skandha 11 Chapter 17 verse 57')).toEqual({ text: 'bhagavatam', skandha: 11, chapter: 17, verse: 57 })
    expect(refLabel('bhagavad_gita chapter 3 verse 35')).toEqual({ book: 'Bhagavad Gita', place: 'Chapter 3 · Verse 35', numeral: '३' })
    expect(refLabel('nonsense').book).toBe('From the teachings')
  })

  it('only verifies a reference that was actually retrieved', () => {
    const sources = [{ text_source: 'bhagavad_gita', book_chapter: 3, verse: 35 }, { text_source: 'bhagavatam', book_chapter: 11017, verse: '57' }]
    expect(refInSources('bhagavad_gita chapter 3 verse 35', sources)).toBe(true)
    expect(refInSources('srimad_bhagavatam Skandha 11 Chapter 17 verse 57', sources)).toBe(true)
    expect(refInSources('bhagavad_gita chapter 2 verse 47', sources)).toBe(false)
  })

  it('turns a reply into clean speech, with no tags or verse numbers', () => {
    const speech = toSpeech(REPLY)
    expect(speech).not.toMatch(/[<>]|35/)
    expect(speech).toContain('From the Gita. Your own path.')
    expect(speech.endsWith('What would that sentence be?')).toBe(true)
    expect(hasPage('plain reply')).toBe(false)
  })
})

describe('reply language', () => {
  it('asks for a Hindi reply in Devanagari when the seeker writes in Hindi', async () => {
    const { replyLanguageLine, buildPrompt } = await import('@/lib/prompts/chat')
    expect(replyLanguageLine('मन शांत कैसे रहे जब सब कुछ बिखर रहा हो?')).toMatch(/Hindi, in Devanagari/)
    expect(replyLanguageLine('How do I stay calm?')).toBe('')
    const prompt = buildPrompt([], [], 'मन शांत कैसे रहे जब सब कुछ बिखर रहा हो?')
    // stated right before the answer, after the seeker's message
    expect(prompt.trimEnd().split('\n').slice(-2)[0]).toMatch(/Hindi/)
  })

  it('opens the page on the reply after the root question, not later', async () => {
    const { journeyLine, buildPrompt } = await import('@/lib/prompts/chat')
    const q = { role: 'assistant' as const, content: 'Torn. Whose face do you see disappointed?' }
    const u = { role: 'user' as const, content: 'I am torn' }
    // First turn, short message: room for one question.
    expect(journeyLine([], 'I am torn', true)).toBe('')
    // First turn, but they have said a lot already: open now.
    expect(journeyLine([], 'My father wants me to take over the shop but I have wanted to teach music since I was a child and I cannot sleep', true)).toMatch(/open the page/)
    // They answered the question: open now.
    expect(journeyLine([u, q], 'everything', true)).toMatch(/open the page/)
    // No passages retrieved: no page is possible.
    expect(journeyLine([u, q], 'everything', false)).toBe('')
    // Right after a page, the next two replies are told not to open one.
    const page = { role: 'assistant' as const, content: '<page ref="x" title="t"><moment>m</moment></page> What next?' }
    expect(journeyLine([u, q, u, page], 'ok', true)).toMatch(/Do not open a page/)
    expect(journeyLine([u, q, u, page, u, q], 'ok', true)).toMatch(/Do not open a page/)
    expect(journeyLine([u, q, u, page, u, q, u, q], 'ok', true)).toMatch(/open the page/)
    // It sits just before the reply, after the seeker's message.
    const p = buildPrompt([{ text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 't' } as never], [u, q], 'everything')
    expect(p.lastIndexOf('Now open the page')).toBeGreaterThan(p.indexOf('Seeker: everything'))
  })

  it('voice mode: speaks a teaching instead of writing a page, and the page directive never wins', async () => {
    const { journeyLine, buildPrompt } = await import('@/lib/prompts/chat')
    const { withVoiceMode } = await import('@/lib/prompts/voice')
    const u = { role: 'user' as const, content: 'I am tired of everything' }
    const q = { role: 'assistant' as const, content: 'That sounds heavy. What wears on you most?' }
    const src = [{ text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 't' } as never]

    // When the book would be due, voice gets a spoken teaching, not the page.
    const open = journeyLine([u, q], 'my family', true, true)
    expect(open).toMatch(/Spoken reply/)
    expect(open).toMatch(/tell a friend/)
    expect(open).not.toMatch(/open the page/)

    const p = buildPrompt(src, [u, q], 'my family', withVoiceMode('SYSTEM', true), [], { voice: true })
    expect(p).not.toMatch(/Now open the page/)
    expect(p).toMatch(/Voice conversation mode/)
    // The spoken directive is the last instruction before the reply.
    expect(p.lastIndexOf('Spoken reply')).toBeGreaterThan(p.indexOf('Seeker: my family'))
    expect(p.trimEnd().endsWith('Yogi:')).toBe(true)
  })

  it('voice mode: after a spoken teaching it lets the conversation breathe, as the page does in text', async () => {
    const { journeyLine } = await import('@/lib/prompts/chat')
    const u = { role: 'user' as const, content: 'ok' }
    const told = { role: 'assistant' as const, content: 'In the Gita, Krishna tells Arjuna to act without clinging to the result. What would that look like tomorrow?' }
    const plain = { role: 'assistant' as const, content: 'That makes sense. Who do you talk to about it?' }
    expect(journeyLine([u, told], 'ok', true, true)).toMatch(/stay with what they said/)
    expect(journeyLine([u, told, u, plain], 'ok', true, true)).toMatch(/stay with what they said/)
    expect(journeyLine([u, told, u, plain, u, plain], 'ok', true, true)).toMatch(/tell a friend/)
    // Hindi names count too.
    const toldHi = { role: 'assistant' as const, content: 'गीता में कृष्ण अर्जुन से कहते हैं…' }
    expect(journeyLine([u, toldHi], 'ठीक है', true, true)).toMatch(/stay with what they said/)
    // Text mode is unchanged: a spoken-style mention isn't a page.
    expect(journeyLine([u, told], 'ok', true, false)).toMatch(/open the page/)
  })

  it('voice mode: speaks in the seeker\'s language without page wording, and forbids invented people', async () => {
    const { replyLanguageLine } = await import('@/lib/prompts/chat')
    const { VOICE_MODE_ADDENDUM } = await import('@/lib/prompts/voice')
    expect(replyLanguageLine('मन शांत कैसे रहे जब सब कुछ बिखर रहा हो?', true)).toBe('[Speak your entire reply in Hindi, in Devanagari script.]')
    expect(VOICE_MODE_ADDENDUM).toMatch(/Never invent a name or a story/)
    expect(VOICE_MODE_ADDENDUM).toMatch(/not Krishna and not God/)
    expect(VOICE_MODE_ADDENDUM).toMatch(/Never use the <page> format/)
  })
})
