interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export function MessageBubble({ role, content, streaming = false }: MessageBubbleProps) {
  const isThinking = role === 'assistant' && streaming && content === ''
  const cls = [
    'message-bubble',
    `message-bubble--${role}`,
    streaming && !isThinking ? 'streaming' : '',
    isThinking ? 'message-bubble--thinking' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {isThinking ? (
        <span className="thinking-dots" data-thinking="true" aria-label="Thinking">
          <span /><span /><span />
        </span>
      ) : content}
    </div>
  )
}
