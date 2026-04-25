'use client'
import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ChatWindow } from '@/components/ChatWindow'
import { DisclaimerBadge } from '@/components/DisclaimerBadge'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useTTS } from '@/hooks/useTTS'

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
  const { enqueue, stop, toggle, enabled: ttsEnabled } = useTTS()
  const sentenceBufferRef = useRef('')

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
    stop()
    sentenceBufferRef.current = ''

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
          sentenceBufferRef.current += chunk
          // Enqueue completed sentences to Polly mid-stream
          const boundary = sentenceBufferRef.current.search(/[.!?]\s/)
          if (boundary !== -1) {
            const sentence = sentenceBufferRef.current.slice(0, boundary + 1)
            sentenceBufferRef.current = sentenceBufferRef.current.slice(boundary + 2)
            enqueue(sentence)
          }
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
      } else {
        // Flush any remaining partial sentence
        if (sentenceBufferRef.current.trim()) enqueue(sentenceBufferRef.current.trim())
        sentenceBufferRef.current = ''
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
      <button
        onClick={() => { toggle(); stop() }}
        className={`tts-toggle${ttsEnabled ? ' tts-toggle--active' : ''}`}
        title={ttsEnabled ? 'Mute voice' : 'Unmute voice'}
        aria-label={ttsEnabled ? 'Mute voice' : 'Unmute voice'}
        type="button"
      >
        {ttsEnabled ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <line x1="23" y1="9" x2="17" y2="15"/>
            <line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
        )}
      </button>
      <ChatWindow messages={messages} onSend={handleSend} loading={loading} />
    </main>
  )
}
