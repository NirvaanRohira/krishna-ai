interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
  return (
    <div className={`message-bubble message-bubble--${role}`}>
      {content}
    </div>
  )
}
