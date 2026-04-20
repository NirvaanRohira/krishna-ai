'use client'
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
  return (
    <div className="chat-window">
      {messages.length === 0 ? (
        <div className="chat-window__empty">
          <span className="chat-window__empty-title">Namaste</span>
          <span className="chat-window__empty-hint">
            What is weighing on you today?
          </span>
        </div>
      ) : (
        <div className="chat-window__messages">
          {messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
        </div>
      )}
      <InputBar onSubmit={onSend} loading={loading} />
    </div>
  )
}
