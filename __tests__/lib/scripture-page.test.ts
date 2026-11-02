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
})
