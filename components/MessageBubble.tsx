interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export function MessageBubble({ role, content, streaming = false }: MessageBubbleProps) {
  const cls = [
    'message-bubble',
    `message-bubble--${role}`,
    role === 'assistant' && streaming ? 'streaming' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {content}
    </div>
  )
}
