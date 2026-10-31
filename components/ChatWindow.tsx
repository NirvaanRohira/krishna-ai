'use client'
import { useEffect, useRef } from 'react'
import { MessageBubble } from '@/components/MessageBubble'
import { InputBar } from '@/components/InputBar'
import type { Source } from '@/lib/sources'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

interface ChatWindowProps {
  messages: Message[]
  onSend: (message: string) => void
  loading: boolean
}

// Real first questions people bring, in the languages they bring them.
const STARTERS = [
  'I’m torn between my duty and what I want',
  'How do I stop overthinking about the future?',
  'मन शांत कैसे रहे जब सब कुछ बिखर रहा हो?',
  'What does the Gita say about failure?',
]

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function ChatWindow({ messages, onSend, loading }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  return (
    <div className="chat-window">
      {messages.length === 0 ? (
        <div className="chat-window__empty">
          <h1 className="chat-window__empty-title fade-up">
            Namaste<span lang="hi">नमस्ते</span>
          </h1>
          <p className="chat-window__empty-hint fade-up fade-up-delay-1">
            What is weighing on you today? Write the way you would say it to a friend, in any language.
          </p>
          <ul className="starters fade-up fade-up-delay-2" aria-label="Ways to begin">
            {STARTERS.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => onSend(s)} disabled={loading}>
                  <span lang={/[ऀ-ॿ]/.test(s) ? 'hi' : undefined}>{s}</span>
                  <Arrow />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="chat-window__messages" aria-live="polite">
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              role={m.role}
              content={m.content}
              sources={m.sources}
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
