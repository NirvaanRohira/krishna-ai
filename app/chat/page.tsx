'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChatWindow } from '@/components/ChatWindow'
import { DisclaimerBadge } from '@/components/DisclaimerBadge'
import { createBrowserSupabaseClient } from '@/lib/supabase'

type Message = { role: 'user' | 'assistant'; content: string }

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
    })
  }, [router])

  async function handleSend(message: string) {
    const updated = [...messages, { role: 'user' as const, content: message }]
    setMessages(updated)
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: messages, sessionId }),
      })

      if (res.status === 401) {
        router.push('/login')
        return
      }

      const data = await res.json()
      if (data.sessionId && !sessionId) setSessionId(data.sessionId)
      setMessages([...updated, { role: 'assistant' as const, content: data.response }])
    } catch {
      setMessages([...updated, { role: 'assistant' as const, content: 'Something went wrong. Please try again.' }])
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
