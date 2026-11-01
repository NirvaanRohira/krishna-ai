'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ScriptureBook } from '@/components/ScriptureBook'
import { DailyVerseToggle } from '@/components/DailyVerseToggle'
import { InstallButton } from '@/components/InstallButton'
import type { Source } from '@/lib/sources'

type Verse = { day: string; text_source: string; book_chapter: number; verse: number; title: string; moment: string; teaching: string; life: string; practice: string }

export default function TodaysVersePage() {
  const [data, setData] = useState<{ verse: Verse | null; source?: Source } | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/verse/today').then((r) => r.json()).then((d) => { if (live) setData(d) }).catch(() => { if (live) setData({ verse: null }) })
    return () => { live = false }
  }, [])

  const v = data?.verse
  return (
    <main className="legal-page verse-page">
      <p><Link href="/chat">← Kanha</Link></p>
      <h1>Today&rsquo;s verse</h1>
      {v && <p className="verse-page__date">{new Date(`${v.day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
      {data && !v && <p>Today&rsquo;s page is still being written. Please look again in a little while.</p>}
      {v && (
        <ScriptureBook
          page={{ ref: `bhagavad_gita chapter ${v.book_chapter} verse ${v.verse}`, title: v.title, moment: v.moment, teaching: v.teaching, life: v.life, practice: v.practice, complete: true }}
          sources={data?.source ? [data.source] : []}
        />
      )}
      {v && (
        <p>
          <Link href="/chat" className="btn-primary">Reflect on this with Kanha</Link>
        </p>
      )}
      <h2>Every morning</h2>
      <p>One verse, opened for you around 6:30 each morning. Nothing else, and you can stop it any time.</p>
      <DailyVerseToggle />
      <InstallButton />
      <p className="landing-disclaimer">Kanha is an AI drawing from Sanskrit texts. It is not God, not Krishna, and not a spiritual authority.</p>
    </main>
  )
}
