'use client'
import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ChatWindow } from '@/components/ChatWindow'
import { DisclaimerBadge } from '@/components/DisclaimerBadge'
import { createBrowserSupabaseClient } from '@/lib/supabase'

type Message = { role: 'user' | 'assistant'; content: string }

const FALLBACK_ERROR = 'Something went wrong. Please try again.'

async function consumeStream(
  res: Response,
  onChunk: (text: string) => void,
  onMeta: (sessionId: string) => void,
  onError: (msg: string) => void,
) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue
      try {
        const d = JSON.parse(line.slice(6))
        if (d.t === 's') onMeta(d.id)
        if (d.t === 'c') onChunk(d.v)
        if (d.t === 'e') onError(d.msg ?? FALLBACK_ERROR)
      } catch { /* skip malformed lines */ }
    }
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
    })
  }, [router])

  async function handleSend(message: string) {
    // Capture history before any state mutations
    const priorMessages = [...messagesRef.current]
    const withUser: Message[] = [...priorMessages, { role: 'user', content: message }]
    setMessages(withUser)
    setLoading(true)

    // Placeholder so user sees something immediately
    const withPlaceholder: Message[] = [...withUser, { role: 'assistant', content: '' }]
    setMessages(withPlaceholder)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: priorMessages, sessionId }),
      })

      if (res.status === 401) {
        router.push('/login')
        return
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        setMessages([...withUser, { role: 'assistant', content: data.error ?? FALLBACK_ERROR }])
        return
      }

      let assembled = ''
      let errorMsg = ''

      await consumeStream(
        res,
        (chunk) => {
          assembled += chunk
          flushSync(() => {
            setMessages([...withUser, { role: 'assistant', content: assembled }])
          })
        },
        (id) => {
          if (!sessionId) setSessionId(id)
        },
        (msg) => {
          errorMsg = msg
        },
      )

      if (assembled === '') {
        setMessages([...withUser, { role: 'assistant', content: errorMsg || FALLBACK_ERROR }])
      }
    } catch {
      setMessages([...withUser, { role: 'assistant', content: FALLBACK_ERROR }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="chat-page">
      <DisclaimerBadge />
      <ChatWindow messages={messages} onSend={handleSend} loading={loading} />
    </main>
  )
}
