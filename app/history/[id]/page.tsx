'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageBubble } from '@/components/MessageBubble'
import { useLang } from '@/components/LangProvider'

type Msg = { role: 'user' | 'assistant'; content: string }

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { lang, t } = useLang()
  const [data, setData] = useState<{ startedAt: string; messages: Msg[] } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/history/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (live) setData(d) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [id])

  return (
    <main className="legal-page history-thread">
      <p><Link href="/history">{t('history.all')}</Link></p>
      <h1>{t('history.one_title')}</h1>
      {data && (
        <p className="history-meta">
          {new Date(data.startedAt).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
      {failed && <p role="alert" className="auth-error" style={{ textAlign: 'left' }}>{t('history.not_found')}</p>}
      {!data && !failed && (
        <div className="history-messages" aria-busy="true" aria-label={t('history.loading_one')}>
          <span className="skeleton skeleton--line" style={{ width: '55%', marginLeft: 'auto' }} />
          <span className="skeleton skeleton--line" />
          <span className="skeleton skeleton--line" style={{ width: '85%' }} />
          <span className="skeleton skeleton--line" style={{ width: '40%', marginLeft: 'auto', marginTop: '1.4rem' }} />
          <span className="skeleton skeleton--line" style={{ width: '92%' }} />
        </div>
      )}
      {data && (
        <div className="history-messages">
          {data.messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} animateBook={false} />
          ))}
        </div>
      )}
      <p className="history-continue"><Link href="/chat" className="btn-primary">{t('history.new')}</Link></p>
      <p className="landing-disclaimer">{t('common.disclaimer')}</p>
    </main>
  )
}
