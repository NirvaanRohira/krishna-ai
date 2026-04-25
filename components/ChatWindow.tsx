'use client'
import { useEffect, useRef } from 'react'
import { MessageBubble } from '@/components/MessageBubble'
import { InputBar } from '@/components/InputBar'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatWindowProps {
  messages: Message[]
  onSend: (message: string) => void
  loading: boolean
}

export function ChatWindow({ messages, onSend, loading }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="chat-window">
      {messages.length === 0 ? (
        <div className="chat-window__empty">
          <svg className="chat-window__empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-5-5-11-5-11z"/>
            <path d="M12 12c0 0-2 1.5-2 3a2 2 0 0 0 4 0c0-1.5-2-3-2-3z"/>
          </svg>
          <span className="chat-window__empty-title">Namaste</span>
          <span className="chat-window__empty-hint">
            What is weighing on you today?
          </span>
        </div>
      ) : (
        <div className="chat-window__messages">
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              role={m.role}
              content={m.content}
              streaming={loading && i === messages.length - 1 && m.role === 'assistant'}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      )}
      <InputBar onSubmit={onSend} loading={loading} />
    </div>
  )
}
