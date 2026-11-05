import type { Source } from '@/lib/sources'
import { splitReply, hasPage, refInSources, type ScripturePage } from '@/lib/scripture-page'
import { ScriptureBook } from '@/components/ScriptureBook'
import { ThinkingDots } from '@/components/ThinkingDots'

/**
 * Lays a reply out as books: the text before the first page becomes its lead, the text after
 * the last page its question. Text between two pages (rare) leads the second one.
 */
function bookReply(content: string, render: (page: ScripturePage, lead: string, question: string, i: number) => React.ReactNode) {
  const segs = splitReply(content)
  const pages = segs.flatMap((s, i) => (s.kind === 'page' ? [i] : []))
  const lastPage = pages[pages.length - 1]
  const out: React.ReactNode[] = []
  let pending: string[] = []
  segs.forEach((seg, i) => {
    if (seg.kind === 'text') { if (i < lastPage) pending.push(seg.text); return }
    const question = i === lastPage ? segs.slice(i + 1).flatMap((t) => (t.kind === 'text' ? [t.text] : [])).join('\n\n') : ''
    out.push(render(seg.page, pending.join('\n\n'), question, i))
    pending = []
  })
  return out
}

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  sources?: Source[]
  /** Play the book-opening animation (live replies); history renders it already open. */
  animateBook?: boolean
}

export function MessageBubble({ role, content, streaming = false, sources = [], animateBook = true }: MessageBubbleProps) {
  const isThinking = role === 'assistant' && streaming && content === ''
  const cls = [
    'message-bubble',
    `message-bubble--${role}`,
    streaming && !isThinking ? 'streaming' : '',
    isThinking ? 'message-bubble--thinking' : '',
  ].filter(Boolean).join(' ')

  // The citation lives in the book (its running head, chapter and folio); a reply without a
  // book (a question, a conversational turn) cites nothing.

  return (
    <div className={cls}>
      {isThinking ? (
        <ThinkingDots />
      ) : role === 'assistant' && hasPage(content) ? (
        // One reply, one object: Kanha's opening line and closing question are written into
        // the book itself (head and foot of the reflection page), not around it.
        bookReply(content, (page, lead, question, i) => (
          // Before the citations arrive (mid-stream, or history without them) trust the
          // reference; once they're known, only show chapter and verse if it was retrieved.
          <ScriptureBook
            key={i}
            page={page}
            lead={lead}
            question={question}
            sources={sources}
            streaming={streaming}
            animate={animateBook}
            verified={streaming || sources.length === 0 || refInSources(page.ref, sources)}
          />
        ))
      ) : content}
    </div>
  )
}
