// The "page" a reply can open: one passage, told as a moment in the story, what it teaches,
// what it means for this person, and one small practice. The model writes it as light XML:
//
//   <page ref="bhagavad_gita chapter 2 verse 47" title="Your right is to the action">
//   <moment>…</moment><teaching>…</teaching><life>…</life><practice>…</practice>
//   </page>
//
// This module splits a (possibly still-streaming) reply into text and page segments, builds
// the human label for the reference, and turns everything into plain speech for the voice.

export type ScripturePage = {
  ref: string
  title: string
  moment: string
  teaching: string
  life: string
  practice: string
  /** False while the closing </page> hasn't streamed in yet. */
  complete: boolean
}

export type Segment = { kind: 'text'; text: string } | { kind: 'page'; page: ScripturePage }

const OPEN = /<page\b([^>]*)>/i
const CLOSE = /<\/page>/i

function attr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) ?? attrs.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'))
  return (m?.[1] ?? '').trim()
}

function section(body: string, tag: string): string {
  const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)(?:</${tag}>|$)`, 'i'))
  return (m?.[1] ?? '').replace(/<[^>]*$/, '').trim()
}

/** Drop a half-streamed tag at the very end ("…the moment <tea") so it never flashes on screen. */
function trimPartialTag(s: string): string {
  return s.replace(/<\/?[a-z]*[^>]*$/i, '')
}

export function splitReply(content: string): Segment[] {
  const out: Segment[] = []
  let rest = content
  while (rest.length) {
    const open = rest.match(OPEN)
    if (!open || open.index === undefined) {
      const text = trimPartialTag(rest).trim()
      if (text) out.push({ kind: 'text', text })
      break
    }
    const before = rest.slice(0, open.index).trim()
    if (before) out.push({ kind: 'text', text: before })
    const afterOpen = rest.slice(open.index + open[0].length)
    const close = afterOpen.match(CLOSE)
    const body = close && close.index !== undefined ? afterOpen.slice(0, close.index) : afterOpen
    out.push({
      kind: 'page',
      page: {
        ref: attr(open[1], 'ref'),
        title: attr(open[1], 'title'),
        moment: section(body, 'moment'),
        teaching: section(body, 'teaching'),
        life: section(body, 'life'),
        practice: section(body, 'practice'),
        complete: Boolean(close),
      },
    })
    rest = close && close.index !== undefined ? afterOpen.slice(close.index + close[0].length) : ''
  }
  return out
}

export function hasPage(content: string): boolean {
  return OPEN.test(content)
}

export type ParsedRef = { text: 'gita' | 'bhagavatam' | 'other'; skandha?: number; chapter?: number; verse?: number }

/** "bhagavad_gita chapter 2 verse 47" / "srimad_bhagavatam Skandha 11 Chapter 17 verse 57" / "Gita 2.47" */
export function parseRef(ref: string): ParsedRef {
  const r = ref.toLowerCase()
  const nums = (r.match(/\d+/g) ?? []).map(Number)
  if (r.includes('bhagavatam')) {
    const [skandha, chapter, verse] = nums
    return { text: 'bhagavatam', skandha, chapter, verse }
  }
  if (r.includes('gita')) {
    const [chapter, verse] = nums
    return { text: 'gita', chapter, verse }
  }
  return { text: 'other' }
}

const DEVANAGARI = '०१२३४५६७८९'
export const toDevanagari = (n: number) => String(n).replace(/\d/g, (d) => DEVANAGARI[Number(d)])

/** Display label for a page's reference; generic when it can't be read. */
export function refLabel(ref: string): { book: string; place: string; numeral: string } {
  const p = parseRef(ref)
  if (p.text === 'gita' && p.chapter) {
    return { book: 'Bhagavad Gita', place: `Chapter ${p.chapter}${p.verse ? ` · Verse ${p.verse}` : ''}`, numeral: toDevanagari(p.chapter) }
  }
  if (p.text === 'bhagavatam' && p.skandha) {
    return {
      book: 'Srimad Bhagavatam',
      place: `Canto ${p.skandha}${p.chapter ? ` · Chapter ${p.chapter}` : ''}${p.verse ? ` · Verse ${p.verse}` : ''}`,
      numeral: toDevanagari(p.skandha),
    }
  }
  return { book: 'From the teachings', place: '', numeral: 'ॐ' }
}

/** Whether a page's reference is one of the passages actually retrieved for this answer. */
export function refInSources(ref: string, sources: { text_source: string; book_chapter: string | number; verse: string | number }[]): boolean {
  const p = parseRef(ref)
  return sources.some((s) => {
    const ch = Number(s.book_chapter)
    const v = Number(String(s.verse).split(/[-–]/)[0])
    if (p.text === 'gita') return s.text_source === 'bhagavad_gita' && ch === p.chapter && v === p.verse
    if (p.text === 'bhagavatam') {
      return s.text_source === 'bhagavatam' && Math.floor(ch / 1000) === p.skandha && ch % 1000 === p.chapter && v === p.verse
    }
    return false
  })
}

/** What the voice should say: the page read as natural prose, no tags or numbers. */
export function toSpeech(content: string): string {
  return splitReply(content)
    .map((seg) => {
      if (seg.kind === 'text') return seg.text
      const { page } = seg
      const book = refLabel(page.ref).book
      const intro = book === 'From the teachings' ? '' : `From the ${book === 'Bhagavad Gita' ? 'Gita' : 'Bhagavatam'}. `
      return [intro + (page.title ? `${page.title}.` : ''), page.moment, page.teaching, page.life, page.practice].filter(Boolean).join(' ')
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain text for captions, previews and memory. */
export const toPlain = toSpeech
