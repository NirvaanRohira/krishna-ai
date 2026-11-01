'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseRef, refInSources, toDevanagari, type ScripturePage } from '@/lib/scripture-page'
import { formatShloka, iastToDevanagari } from '@/lib/devanagari'
import { GITA_CHAPTERS, BOOK_TITLES, type BookKind } from '@/lib/scripture-meta'
import { pageRustles } from '@/lib/sfx'
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

const COVER_MS = 900
const LEAF_GAP_MS = 130
const LEAF_MS = 520

function bookKind(ref: string): BookKind {
  const t = parseRef(ref).text
  return t === 'gita' || t === 'bhagavatam' ? t : 'other'
}

/** The Sanskrit of the cited verse, when the server shared it (SHOW_VERSE_TEXT). */
function findVerseText(ref: string, sources: Source[]): string | undefined {
  return sources.find((s) => s.text && refInSources(ref, [s]))?.text
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
}: {
  page: ScripturePage
  sources?: Source[]
  verified?: boolean
  animate?: boolean
  streaming?: boolean
}) {
  const p = parseRef(page.ref)
  const kind = verified ? bookKind(page.ref) : 'other'
  const title = BOOK_TITLES[kind]
  const chapter = kind === 'gita' ? p.chapter : kind === 'bhagavatam' ? p.skandha : undefined
  const leaves = Math.min(Math.max(chapter ?? 3, 3), 9)
  const [skip, setSkip] = useState(false)
  // The book waits, closed, until it scrolls into view; then it opens.
  const [started, setStarted] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const [settled, setSettled] = useState(!animate)
  const totalMs = COVER_MS + leaves * LEAF_GAP_MS + LEAF_MS

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
    if (!reduced) pageRustles([0.15, ...Array.from({ length: leaves }, (_, i) => (COVER_MS + i * LEAF_GAP_MS) / 1000 + 0.1)])
    const t = setTimeout(() => setSettled(true), reduced ? 0 : totalMs)
    return () => clearTimeout(t)
  }, [animate, started, leaves, totalMs])

  const verseText = verified ? findVerseText(page.ref, sources) : undefined
  const shloka = useMemo(() => (verseText ? formatShloka(verseText, p.verse) : null), [verseText, p.verse])

  const place =
    kind === 'gita' && p.chapter
      ? { heading: `Adhyāya ${p.chapter}`, sub: GITA_CHAPTERS[p.chapter - 1]?.[1] ?? '', name: GITA_CHAPTERS[p.chapter - 1]?.[0] }
      : kind === 'bhagavatam' && p.skandha
        ? { heading: `Skandha ${p.skandha} · Chapter ${p.chapter ?? ''}`, sub: '', name: undefined }
        : { heading: 'From the teachings', sub: '', name: undefined }
  const verseMark = verified && p.verse ? toDevanagari(p.verse) : null

  const right: [string, string][] = [
    ['The moment', page.moment],
    ['In your life', page.life],
    ['For today', page.practice],
  ]
  const lastFilled = right.reduce((acc, [, t], i) => (t ? i : acc), -1)
  const writing = streaming && !page.complete

  const cls = ['book', animate && !settled ? 'book--opening' : 'book--open', animate && !started ? 'book--waiting' : '', skip ? 'book--skip' : ''].filter(Boolean).join(' ')

  return (
    <figure
      ref={rootRef}
      className={cls}
      style={{ ['--leaves' as string]: leaves, ['--cover-ms' as string]: `${COVER_MS}ms`, ['--leaf-gap' as string]: `${LEAF_GAP_MS}ms`, ['--leaf-ms' as string]: `${LEAF_MS}ms` }}
      onClick={() => { if (!settled) { setSkip(true); setSettled(true) } }}
      aria-label={`${title.latin}${place.heading ? `, ${place.heading}` : ''}${verified && p.verse ? `, verse ${p.verse}` : ''}`}
    >
      <div className="book__spread">
        <section className="book__page book__page--left">
          <p className="book__running">{title.latin}</p>
          <p className="book__chapter">{place.heading}</p>
          {place.name && <p className="book__chapter-name">{iastToDevanagari(place.name)} · {place.sub}</p>}
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
          {verified && p.verse && <p className="book__folio">{kind === 'gita' ? `${p.chapter}.${p.verse}` : kind === 'bhagavatam' ? `${p.skandha}.${p.chapter}.${p.verse}` : ''}</p>}
        </section>

        <section className="book__page book__page--right">
          {right.map(([name, text], i) =>
            text ? (
              <div key={name} className="book__section">
                <h4>{name}</h4>
                <p>
                  {text}
                  {writing && i === lastFilled && <Quill />}
                </p>
              </div>
            ) : null,
          )}
          {writing && lastFilled === -1 && <p className="book__waiting">The ink is still wet… <Quill /></p>}
        </section>
      </div>

      {animate && !settled && (
        <div className="book__motion" aria-hidden="true">
          {Array.from({ length: leaves }, (_, i) => (
            <div key={i} className="book__leaf" style={{ ['--i' as string]: i }}>
              <span>अध्याय {toDevanagari(i + 1)}</span>
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
          </div>
        </div>
      )}
    </figure>
  )
}
