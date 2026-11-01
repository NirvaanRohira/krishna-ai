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
