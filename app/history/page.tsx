'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Conversation = { id: string; startedAt: string; turns: number; preview: string }

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function HistoryPage() {
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
      <p><Link href="/chat">← Back to chat</Link></p>
      <h1>Past conversations</h1>
      <p>Your earlier conversations with Kanha, newest first. Conversations are kept for 12 months, and you can delete everything from your <Link href="/account">account</Link>.</p>
      {failed && <p role="alert" className="auth-error" style={{ textAlign: 'left' }}>Could not load your conversations. Please try again.</p>}
      {!items && !failed && (
        <ul className="history-list" aria-busy="true" aria-label="Loading your conversations">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="history-item" aria-hidden="true">
              <span className="skeleton skeleton--line" style={{ width: `${78 - i * 9}%` }} />
              <span className="skeleton skeleton--meta" />
            </li>
          ))}
        </ul>
      )}
      {items && items.length === 0 && <p className="memory-empty">Nothing here yet. Your conversations will appear here.</p>}
      {items && items.length > 0 && (
        <ul className="history-list">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/history/${c.id}`} className="history-item">
                <span className="history-preview">{c.preview || 'Conversation'}</span>
                <span className="history-meta">{when(c.startedAt)} · {c.turns} {c.turns === 1 ? 'exchange' : 'exchanges'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
