'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageBubble } from '@/components/MessageBubble'

type Msg = { role: 'user' | 'assistant'; content: string }

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
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
      <p><Link href="/history">← All conversations</Link></p>
      <h1>Conversation</h1>
      {data && (
        <p className="history-meta">
          {new Date(data.startedAt).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
      {failed && <p role="alert" className="auth-error" style={{ textAlign: 'left' }}>This conversation could not be found.</p>}
      {data && (
        <div className="history-messages">
          {data.messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} animateBook={false} />
          ))}
        </div>
      )}
      <p className="history-continue"><Link href="/chat" className="btn-primary">Start a new conversation</Link></p>
      <p className="landing-disclaimer">Kanha is an AI drawing from Sanskrit texts. It is not God, not Krishna, and not a spiritual authority.</p>
    </main>
  )
}
