'use client'
import { memo, useEffect, useRef } from 'react'
import { MessageBubble } from '@/components/MessageBubble'
import { InputBar } from '@/components/InputBar'
import { TodaysVerse } from '@/components/TodaysVerse'
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

// Each streamed word re-renders the list; only the reply being written needs to. Earlier
// messages keep the same props (same objects), so memo skips them, books and all.
const Bubble = memo(MessageBubble)

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function ChatWindow({ messages, onSend, loading }: ChatWindowProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const sent = messages.filter((m) => m.role === 'user').length

  // Follow the reply as it is written, but only while the reader is at the bottom: if they
  // scroll up to reread, leave them there. Instant, not smooth: a smooth scroll restarted on
  // every word is what makes cheap phones stutter.
  useEffect(() => {
    const el = listRef.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [messages])
  // A new message from the seeker always brings the view down.
  useEffect(() => { pinned.current = true }, [sent])
  const onScroll = () => {
    const el = listRef.current
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

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
          <TodaysVerse onReflect={onSend} disabled={loading} />
        </div>
      ) : (
        <div className="chat-window__messages" aria-live="polite" ref={listRef} onScroll={onScroll}>
          {messages.map((m, i) => (
            <Bubble
              key={i}
              role={m.role}
              content={m.content}
              sources={m.sources}
              streaming={loading && i === messages.length - 1 && m.role === 'assistant'}
            />
          ))}
        </div>
      )}
      <InputBar onSubmit={onSend} loading={loading} />
    </div>
  )
}
