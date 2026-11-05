'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLang } from '@/components/LangProvider'
import type { Lang } from '@/lib/i18n'

type Conversation = { id: string; startedAt: string; turns: number; preview: string }

function when(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function HistoryPage() {
  const { lang, t } = useLang()
  const [items, setItems] = useState<Conversation[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/history', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (live) setItems(d.conversations) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])

  return (
    <main className="legal-page">
      <p><Link href="/chat">{t('common.back_to_chat')}</Link></p>
      <h1>{t('history.title')}</h1>
      <p>{t('history.intro')} <Link href="/account">{t('history.account_link')}</Link>.</p>
      {failed && <p role="alert" className="auth-error" style={{ textAlign: 'left' }}>{t('history.load_failed')}</p>}
      {!items && !failed && (
        <ul className="history-list" aria-busy="true" aria-label={t('history.loading')}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="history-item" aria-hidden="true">
              <span className="skeleton skeleton--line" style={{ width: `${78 - i * 9}%` }} />
              <span className="skeleton skeleton--meta" />
            </li>
          ))}
        </ul>
      )}
      {items && items.length === 0 && <p className="memory-empty">{t('history.empty')}</p>}
      {items && items.length > 0 && (
        <ul className="history-list">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/history/${c.id}`} className="history-item">
                <span className="history-preview">{c.preview || t('history.untitled')}</span>
                <span className="history-meta">{when(c.startedAt, lang)} · {c.turns} {c.turns === 1 ? t('history.exchange') : t('history.exchanges')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
