'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ScriptureBook } from '@/components/ScriptureBook'
import { DailyVerseToggle } from '@/components/DailyVerseToggle'
import { InstallButton } from '@/components/InstallButton'
import type { Source } from '@/lib/sources'
import { useLang } from '@/components/LangProvider'
import { formatDate } from '@/lib/i18n'

type Verse = { day: string; text_source: string; book_chapter: number; verse: number; title: string; moment: string; teaching: string; life: string; practice: string }

export default function TodaysVersePage() {
  const { lang, t } = useLang()
  const [data, setData] = useState<{ verse: Verse | null; source?: Source } | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/verse/today?lang=${lang}`).then((r) => r.json()).then((d) => { if (live) setData(d) }).catch(() => { if (live) setData({ verse: null }) })
    return () => { live = false }
  }, [lang])

  const v = data?.verse
  return (
    <main className="legal-page verse-page">
      <p><Link href="/chat">{lang === 'hi' ? '← कान्हा' : '← Kanha'}</Link></p>
      <h1>{t('verse.title')}</h1>
      {v && <p className="verse-page__date">{formatDate(lang, `${v.day}T00:00:00`, { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
      {data && !v && <p>{t('verse.not_yet')}</p>}
      {v && (
        <ScriptureBook
          page={{ ref: `bhagavad_gita chapter ${v.book_chapter} verse ${v.verse}`, title: v.title, moment: v.moment, teaching: v.teaching, life: v.life, practice: v.practice, complete: true }}
          sources={data?.source ? [data.source] : []}
        />
      )}
      {v && (
        <p>
          <Link href="/chat" className="btn-primary">{t('verse.reflect_cta')}</Link>
        </p>
      )}
      <h2>{t('verse.every_morning')}</h2>
      <p>{t('verse.every_morning_body')}</p>
      <DailyVerseToggle />
      <InstallButton />
      <p className="landing-disclaimer">{t('common.disclaimer')}</p>
    </main>
  )
}
