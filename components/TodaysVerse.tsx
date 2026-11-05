'use client'
import { useEffect, useRef, useState } from 'react'
import { ScriptureBook } from '@/components/ScriptureBook'
import { DailyVerseToggle } from '@/components/DailyVerseToggle'
import { useLang } from '@/components/LangProvider'
import type { Source } from '@/lib/sources'

type Verse = { day: string; text_source: string; book_chapter: number; verse: number; title: string; moment: string; teaching: string; life: string; practice: string }

/**
 * Today's verse, where people already are: on the chat's first screen. A bookmark you can
 * open into the book, or take straight into a conversation.
 */
export function TodaysVerse({ onReflect, disabled }: { onReflect: (message: string) => void; disabled?: boolean }) {
  const { lang, t } = useLang()
  const [data, setData] = useState<{ verse: Verse | null; source?: Source } | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)

  // The book opens when it comes into view, so bring it there.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [open])

  useEffect(() => {
    let live = true
    fetch(`/api/verse/today?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : { verse: null }))
      .then((d) => { if (live) setData(d) })
      .catch(() => { if (live) setData({ verse: null }) })
    return () => { live = false }
  }, [lang])

  const v = data?.verse
  // While it loads, hold its place so the screen doesn't jump when it arrives.
  if (!data) {
    return (
      <section className="todays-verse todays-verse--loading" aria-busy="true" aria-label={t('verse.loading')}>
        <span className="skeleton skeleton--parchment skeleton--meta" />
        <span className="skeleton skeleton--parchment skeleton--title" />
        <span className="skeleton skeleton--parchment skeleton--line" />
        <span className="skeleton skeleton--parchment skeleton--line" style={{ width: '70%' }} />
      </section>
    )
  }
  if (!v) return null
  const where = lang === 'hi' ? `भगवद् गीता ${v.book_chapter}.${v.verse}` : `Bhagavad Gita ${v.book_chapter}.${v.verse}`
  const reflect = () =>
    onReflect(t('verse.reflect_message', { where, title: v.title }))

  return (
    <section ref={ref} className="todays-verse fade-up fade-up-delay-3" aria-label={t('verse.title')}>
      <p className="todays-verse__eyebrow">{t('verse.title')} · {where}</p>
      <h2 className="todays-verse__title">{v.title}</h2>
      {!open && <p className="todays-verse__teaching">{v.teaching}</p>}
      {open && (
        <ScriptureBook
          page={{ ref: `bhagavad_gita chapter ${v.book_chapter} verse ${v.verse}`, title: v.title, moment: v.moment, teaching: v.teaching, life: v.life, practice: v.practice, complete: true }}
          sources={data?.source ? [data.source] : []}
        />
      )}
      <div className="todays-verse__actions">
        {!open && <button type="button" className="todays-verse__open" onClick={() => setOpen(true)}>{t('verse.open')}</button>}
        <button type="button" className="todays-verse__reflect" onClick={reflect} disabled={disabled}>{t('verse.reflect')}</button>
      </div>
      <DailyVerseToggle compact />
    </section>
  )
}
