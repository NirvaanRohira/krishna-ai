'use client'
import { useEffect, useRef, useState } from 'react'
import { ScriptureBook } from '@/components/ScriptureBook'
import { DailyVerseToggle } from '@/components/DailyVerseToggle'
import type { Source } from '@/lib/sources'

type Verse = { day: string; text_source: string; book_chapter: number; verse: number; title: string; moment: string; teaching: string; life: string; practice: string }

/**
 * Today's verse, where people already are: on the chat's first screen. A bookmark you can
 * open into the book, or take straight into a conversation.
 */
export function TodaysVerse({ onReflect, disabled }: { onReflect: (message: string) => void; disabled?: boolean }) {
  const [data, setData] = useState<{ verse: Verse | null; source?: Source } | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)

  // The book opens when it comes into view, so bring it there.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [open])

  useEffect(() => {
    let live = true
    fetch('/api/verse/today')
      .then((r) => (r.ok ? r.json() : { verse: null }))
      .then((d) => { if (live) setData(d) })
      .catch(() => { if (live) setData({ verse: null }) })
    return () => { live = false }
  }, [])

  const v = data?.verse
  if (!v) return null
  const where = `Bhagavad Gita ${v.book_chapter}.${v.verse}`
  const reflect = () =>
    onReflect(`I want to reflect on today's verse, ${where}, "${v.title}". What is it asking of me in my own life today?`)

  return (
    <section ref={ref} className="todays-verse fade-up fade-up-delay-3" aria-label="Today's verse">
      <p className="todays-verse__eyebrow">Today&rsquo;s verse · {where}</p>
      <h2 className="todays-verse__title">{v.title}</h2>
      {!open && <p className="todays-verse__teaching">{v.teaching}</p>}
      {open && (
        <ScriptureBook
          page={{ ref: `bhagavad_gita chapter ${v.book_chapter} verse ${v.verse}`, title: v.title, moment: v.moment, teaching: v.teaching, life: v.life, practice: v.practice, complete: true }}
          sources={data?.source ? [data.source] : []}
        />
      )}
      <div className="todays-verse__actions">
        {!open && <button type="button" className="todays-verse__open" onClick={() => setOpen(true)}>Open the book</button>}
        <button type="button" className="todays-verse__reflect" onClick={reflect} disabled={disabled}>Reflect on this with Kanha ›</button>
      </div>
      <DailyVerseToggle compact />
    </section>
  )
}
