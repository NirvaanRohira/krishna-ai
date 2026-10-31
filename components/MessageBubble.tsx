import { formatSourceRef, shortSourceRef, type Source } from '@/lib/sources'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  sources?: Source[]
}

export function MessageBubble({ role, content, streaming = false, sources = [] }: MessageBubbleProps) {
  const isThinking = role === 'assistant' && streaming && content === ''
  const cls = [
    'message-bubble',
    `message-bubble--${role}`,
    streaming && !isThinking ? 'streaming' : '',
    isThinking ? 'message-bubble--thinking' : '',
  ].filter(Boolean).join(' ')

  // Citations appear once the answer has finished, so they never jump around mid-stream.
  const showSources = role === 'assistant' && !streaming && sources.length > 0

  return (
    <div className={cls}>
      {isThinking ? (
        <span className="thinking-dots" data-thinking="true" aria-label="Reflecting">
          <span /><span /><span />
        </span>
      ) : content}
      {showSources && (
        <details className="message-sources">
          <summary>
            Drawn from
            {sources.slice(0, 4).map((s, i) => (
              <span key={i} className="src-ref">{shortSourceRef(s)}{i < Math.min(sources.length, 4) - 1 ? ',' : ''}</span>
            ))}
            {sources.length > 4 && <span>+{sources.length - 4}</span>}
          </summary>
          <ol>
            {sources.map((s, i) => (
              <li key={i}>
                <cite>{formatSourceRef(s)}</cite>
                {s.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}
