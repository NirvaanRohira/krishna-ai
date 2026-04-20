'use client'
import { useState } from 'react'
import { ChatWindow } from '@/components/ChatWindow'
import { DisclaimerBadge } from '@/components/DisclaimerBadge'

type Message = { role: 'user' | 'assistant'; content: string }

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  async function handleSend(message: string) {
    const updated = [...messages, { role: 'user' as const, content: message }]
    setMessages(updated)
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: messages }),
      })
      const data = await res.json()
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
