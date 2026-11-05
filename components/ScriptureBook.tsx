'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseRef, refInSources, toDevanagari, type ScripturePage } from '@/lib/scripture-page'
import { formatShloka, iastToDevanagari } from '@/lib/devanagari'
import { GITA_CHAPTERS, BOOK_TITLES, type BookKind } from '@/lib/scripture-meta'
import { pageRustles } from '@/lib/sfx'
import { shareCard } from '@/lib/share-card'
import { useLang } from '@/components/LangProvider'
import type { Source } from '@/lib/sources'

/**
 * The scripture opens as an old book: the leather cover swings open, pages riffle past (one
 * for each chapter before the one we're going to), and it settles on a spread.
 *   left page  — the verse itself: Sanskrit in Devanagari, its romanisation, the reference,
 *                and its essence;
 *   right page — Kanha's reflection for this person, written out with a quill as it streams.
 * On a phone the book is a single page and the spread reads top to bottom.
 * Tap to skip the animation; reduced-motion users get a plain fade.
 */

const COVER_MS = 1400   // the cover swings open on its spine
const LEAF_GAP_MS = 260 // one leaf after another
const LEAF_MS = 1000    // one leaf turning over
const LEAVES_START = 0.7 // leaves begin once the cover is most of the way open
const TURN_MS = 850     // a page turn on the phone

function bookKind(ref: string): BookKind {
  const t = parseRef(ref).text
  return t === 'gita' || t === 'bhagavatam' ? t : 'other'
}

/** The Sanskrit of the cited verse, when the server shared it (SHOW_VERSE_TEXT). */
function findVerseText(ref: string, sources: Source[]): string | undefined {
  return sources.find((s) => s.text && refInSources(ref, [s]))?.text
}

function Ink({ text, live }: { text: string; live: boolean }) {
  if (!live) return <>{text}</>
  const words = text.match(/\S+\s*/g) ?? []
  return <>{words.map((w, i) => <span key={i} className="ink-word">{w}</span>)}</>
}

function Quill() {
  return (
    <svg className="book-quill" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M29 3C19 5 11 12 6 24l-1 5 4-3C16 19 23 11 29 3Z" fill="currentColor" opacity="0.85" />
      <path d="M6 24 18 12" stroke="#f3e6c8" strokeWidth="0.8" fill="none" opacity="0.6" />
    </svg>
  )
}

export function ScriptureBook({
  page,
  sources = [],
  verified = true,
  animate = true,
  streaming = false,
  lead = '',
  question = '',
}: {
  page: ScripturePage
  sources?: Source[]
  verified?: boolean
  animate?: boolean
  streaming?: boolean
  /** Kanha's opening line (what it heard), written at the head of the reflection page. */
  lead?: string
  /** The closing question, written at the foot of the reflection page after the page closes. */
  question?: string
}) {
  const { lang, t } = useLang()
  const p = parseRef(page.ref)
  const kind = verified ? bookKind(page.ref) : 'other'
  const title = BOOK_TITLES[kind]
  const chapter = kind === 'gita' ? p.chapter : kind === 'bhagavatam' ? p.skandha : undefined
  const leaves = Math.min(Math.max(chapter ?? 3, 3), 6)
  const [skip, setSkip] = useState(false)
  // The book waits, closed, until it scrolls into view; then it opens.
  const [started, setStarted] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const [settled, setSettled] = useState(!animate)
  const totalMs = COVER_MS * LEAVES_START + (leaves - 1) * LEAF_GAP_MS + LEAF_MS + 120
  // On a phone the book shows one page at a time and turns from the verse to the reflection.
  const [narrow, setNarrow] = useState(false)
  const [view, setView] = useState<'verse' | 'reflection'>('verse')
  const [userTurned, setUserTurned] = useState(false)

  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!animate || !rootRef.current) return
    // Older browsers without IntersectionObserver: just open.
    if (typeof IntersectionObserver === 'undefined') { const t = setTimeout(() => setStarted(true), 0); return () => clearTimeout(t) }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setStarted(true); io.disconnect() }
    }, { threshold: 0.3 })
    io.observe(rootRef.current)
    return () => io.disconnect()
  }, [animate])

  useEffect(() => {
    if (!animate || !started) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!reduced) pageRustles([0.15, ...Array.from({ length: leaves }, (_, i) => (COVER_MS * LEAVES_START + i * LEAF_GAP_MS) / 1000 + 0.3)])
    const t = setTimeout(() => setSettled(true), reduced ? 0 : totalMs)
    return () => clearTimeout(t)
  }, [animate, started, leaves, totalMs])

  const verseText = verified ? findVerseText(page.ref, sources) : undefined
  const shloka = useMemo(() => (verseText ? formatShloka(verseText, p.verse) : null), [verseText, p.verse])

  const place =
    kind === 'gita' && p.chapter
      ? { heading: t('book.chapter', { n: lang === 'hi' ? toDevanagari(p.chapter) : p.chapter }), sub: lang === 'hi' ? '' : GITA_CHAPTERS[p.chapter - 1]?.[1] ?? '', name: GITA_CHAPTERS[p.chapter - 1]?.[0] }
      : kind === 'bhagavatam' && p.skandha
        ? { heading: t('book.skandha', { s: p.skandha, c: p.chapter ?? '' }), sub: '', name: undefined }
        : { heading: t('book.from_teachings'), sub: '', name: undefined }
  const verseMark = verified && p.verse ? toDevanagari(p.verse) : null

  const right: [string, string][] = [
    [t('book.moment'), page.moment],
    [t('book.life'), page.life],
    [t('book.today'), page.practice],
  ]
  const lastFilled = right.reduce((acc, [, t], i) => (t ? i : acc), -1)
  const writing = streaming && !page.complete
  // The question streams in after </page>, so it is still being written once the page is done.
  const askingLive = streaming && page.complete

  // A page turn on the phone: forward, the verse lifts and turns over to the left,
  // uncovering the reflection beneath it; back, it turns back over the reflection.
  const [turning, setTurning] = useState<'forward' | 'back' | null>(null)
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (turnTimer.current) clearTimeout(turnTimer.current) }, [])
  const goTo = (v: 'verse' | 'reflection') => {
    if (v === view) return
    if (turnTimer.current) clearTimeout(turnTimer.current)
    setTurning(v === 'reflection' ? 'forward' : 'back')
    setView(v)
    turnTimer.current = setTimeout(() => setTurning(null), TURN_MS)
  }

  // Let the verse be read for a moment, then turn the page to the reflection being written.
  useEffect(() => {
    if (!narrow || !animate || !settled || userTurned || view !== 'verse' || lastFilled < 0) return
    const t = setTimeout(() => {
      setTurning('forward')
      setView('reflection')
      turnTimer.current = setTimeout(() => setTurning(null), TURN_MS)
    }, 2600)
    return () => clearTimeout(t)
  }, [narrow, animate, settled, userTurned, view, lastFilled])
  const turnTo = (v: 'verse' | 'reflection') => { setUserTurned(true); goTo(v) }

  const folio = verified && p.verse ? (kind === 'gita' ? `${p.chapter}.${p.verse}` : kind === 'bhagavatam' ? `${p.skandha}.${p.chapter}.${p.verse}` : '') : ''
  const [sharing, setSharing] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle')
  const canShare = settled && page.complete && Boolean(page.title && page.teaching)
  const onShare = async () => {
    setSharing('busy')
    try {
      const heading = kind === 'gita' && p.chapter
        ? `${t('book.chapter', { n: p.chapter })}${verified && p.verse ? ` · ${lang === 'hi' ? 'श्लोक' : 'Verse'} ${p.verse}` : ''}`
        : kind === 'bhagavatam' && p.skandha ? `${t('book.skandha', { s: p.skandha, c: p.chapter ?? '' })}${p.verse ? ` · ${lang === 'hi' ? 'श्लोक' : 'Verse'} ${p.verse}` : ''}` : t('book.from_teachings')
      const r = await shareCard(
        { bookLatin: title.latin, heading, folio, shloka, verseMark, title: page.title, teaching: page.teaching, practice: page.practice, site: window.location.host,
          labels: { today: t('book.today'), footer: lang === 'hi' ? 'AI द्वारा लिखा गया चिंतन। भगवान नहीं, कृष्ण नहीं।' : 'A reflection written by AI. Not God, not Krishna.' } },
        `kanha-${(folio || 'page').replace(/\./g, '-')}.png`,
      )
      setSharing(r === 'downloaded' ? 'saved' : 'idle')
    } catch {
      setSharing('failed')
    }
  }

  const cls = [
    'book',
    animate && !settled ? 'book--opening' : 'book--open',
    animate && !started ? 'book--waiting' : '',
    animate && settled ? 'book--revealed' : '',
    skip ? 'book--skip' : '',
    narrow ? `book--narrow book--show-${view}` : '',
    narrow && turning ? `book--turn-${turning}` : '',
  ].filter(Boolean).join(' ')

  return (
    <figure
      ref={rootRef}
      className={cls}
      style={{ ['--leaves' as string]: leaves, ['--cover-ms' as string]: `${COVER_MS}ms`, ['--leaf-gap' as string]: `${LEAF_GAP_MS}ms`, ['--leaf-ms' as string]: `${LEAF_MS}ms`, ['--leaves-start' as string]: `${COVER_MS * LEAVES_START}ms`, ['--total-ms' as string]: `${totalMs}ms` }}
      onClick={() => { if (!settled) { setSkip(true); setSettled(true) } }}
      aria-label={`${title.latin}${place.heading ? `, ${place.heading}` : ''}${verified && p.verse ? `, verse ${p.verse}` : ''}`}
    >
      <div className="book__stage">
      <div className="book__tilt">
      <div className="book__spread">
        <section className="book__page book__page--left">
          <p className="book__running">{title.latin}</p>
          <p className="book__chapter">{place.heading}</p>
          {place.name && <p className="book__chapter-name">{iastToDevanagari(place.name)}{place.sub ? ` · ${place.sub}` : ''}</p>}
          <svg className="book__ornament" viewBox="0 0 120 16" aria-hidden="true">
            <path d="M2 8h44M74 8h44" stroke="currentColor" strokeWidth="0.8" />
            <path d="M60 2c4 3 4 9 0 12-4-3-4-9 0-12Z M52 8c3-2 6-2 8 0-2 2-5 2-8 0Z M68 8c-3-2-6-2-8 0 2 2 5 2 8 0Z" fill="currentColor" />
          </svg>
          {shloka ? (
            <>
              <p className="book__shloka" lang="sa">{shloka}</p>
              <p className="book__iast" lang="sa-Latn">{verseText}</p>
            </>
          ) : verseMark ? (
            <p className="book__verse-mark" aria-hidden="true">॥ {verseMark} ॥</p>
          ) : null}
          {page.title && <h3 className="book__title">{page.title}</h3>}
          {page.teaching && <p className="book__essence">{page.teaching}</p>}
          {folio && <p className="book__folio">{folio}</p>}
        </section>

        <section className="book__page book__page--right">
          {lead && <p className="book__lead">{lead}</p>}
          {right.map(([name, text], i) =>
            text ? (
              <div key={name} className="book__section">
                <h4>{name}</h4>
                <p>
                  <Ink text={text} live={writing} />
                  {writing && i === lastFilled && <Quill />}
                </p>
              </div>
            ) : null,
          )}
          {writing && lastFilled === -1 && <p className="book__waiting">{t('book.ink_wet')} <Quill /></p>}
          {question && (
            <p className="book__question">
              <Ink text={question} live={askingLive} />
              {askingLive && <Quill />}
            </p>
          )}
        </section>
      </div>

      {narrow && settled && (
        <nav className="book__turn" aria-label={t('book.turn')}>
          <button type="button" aria-pressed={view === 'verse'} onClick={() => turnTo('verse')}>{t('book.to_verse')}</button>
          <button type="button" aria-pressed={view === 'reflection'} onClick={() => turnTo('reflection')}>{t('book.to_you')}</button>
        </nav>
      )}

      {canShare && (
        <div className="book__share">
          <button type="button" onClick={(e) => { e.stopPropagation(); void onShare() }} disabled={sharing === 'busy'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
            </svg>
            {sharing === 'busy' ? t('book.sharing') : t('book.share')}
          </button>
          {sharing === 'saved' && <span role="status">{t('book.shared_saved')}</span>}
          {sharing === 'failed' && <span role="status">{t('book.share_failed')}</span>}
        </div>
      )}

      {animate && !settled && (
        <div className="book__motion" aria-hidden="true">
          {/* Each leaf is printed on both sides and bends as it turns: an inner half hinged
              on the spine, and an outer half hinged on the inner one that trails behind. */}
          {Array.from({ length: leaves }, (_, i) => (
            <div key={i} className="book__leaf" style={{ ['--i' as string]: i }}>
              <div className="leaf__half leaf__half--inner">
                <div className="leaf__face leaf__face--front" />
                <div className="leaf__face leaf__face--back" />
                <div className="leaf__half leaf__half--outer">
                  <div className="leaf__face leaf__face--front" />
                  <div className="leaf__face leaf__face--back" />
                </div>
              </div>
            </div>
          ))}
          <div className="book__cover">
            <div className="book__cover-front">
              <svg viewBox="0 0 120 120" className="book__cover-lotus" aria-hidden="true">
                <g fill="none" stroke="currentColor" strokeWidth="1.1">
                  <circle cx="60" cy="60" r="50" />
                  {Array.from({ length: 8 }, (_, k) => (
                    <path key={k} d="M60 18 C70 32 70 44 60 54 C50 44 50 32 60 18 Z" transform={`rotate(${k * 45} 60 60)`} />
                  ))}
                </g>
              </svg>
              <p className="book__cover-title" lang="sa">{title.devanagari}</p>
              <p className="book__cover-sub">{title.latin}</p>
            </div>
            <div className="book__cover-back" />
          </div>
        </div>
      )}
      </div>
      </div>
    </figure>
  )
}
