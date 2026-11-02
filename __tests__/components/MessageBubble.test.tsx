import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageBubble } from '@/components/MessageBubble'

describe('MessageBubble', () => {
  it('renders the message content', () => {
    render(<MessageBubble role="user" content="I feel lost in life" />)
    expect(screen.getByText('I feel lost in life')).toBeTruthy()
  })

  it('applies a distinct style for user messages', () => {
    const { container } = render(<MessageBubble role="user" content="user message" />)
    expect(container.firstChild).toBeTruthy()
    expect((container.firstChild as HTMLElement).className).toMatch(/user/)
  })

  it('applies a distinct style for assistant messages', () => {
    const { container } = render(<MessageBubble role="assistant" content="assistant message" />)
    expect(container.firstChild).toBeTruthy()
    expect((container.firstChild as HTMLElement).className).toMatch(/assistant/)
  })

  it('user and assistant bubbles have different class names', () => {
    const { container: userContainer } = render(<MessageBubble role="user" content="msg" />)
    const { container: assistantContainer } = render(<MessageBubble role="assistant" content="msg" />)
    const userClass = (userContainer.firstChild as HTMLElement).className
    const assistantClass = (assistantContainer.firstChild as HTMLElement).className
    expect(userClass).not.toBe(assistantClass)
  })

  it('shows a thinking indicator when streaming with no content yet', () => {
    const { container } = render(<MessageBubble role="assistant" content="" streaming={true} />)
    const bubble = container.firstChild as HTMLElement
    // Bubble should have a thinking class or contain a thinking indicator element
    const hasThinkingClass = bubble.className.includes('thinking')
    const hasThinkingChild = bubble.querySelector('[data-thinking]') !== null
    expect(hasThinkingClass || hasThinkingChild).toBe(true)
  })

  it('does not show thinking indicator when content has arrived', () => {
    const { container } = render(<MessageBubble role="assistant" content="The Gita teaches..." streaming={true} />)
    const bubble = container.firstChild as HTMLElement
    expect(bubble.className).not.toContain('thinking')
    expect(bubble.querySelector('[data-thinking]')).toBeNull()
  })
})

describe('MessageBubble sources', () => {
  const sources = [{ text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'You have a right to action alone.' }]

  it('a reply with a page is one book: the opening line and the question are written inside it', () => {
    const withPage = 'Act without craving the fruit.\n<page ref="bhagavad_gita chapter 2 verse 47" title="The work, not the fruit"><moment>m</moment><teaching>t</teaching><life>l</life><practice>p</practice></page>\nWhat would you do if the result were not yours to decide?'
    const { container } = render(<MessageBubble role="assistant" content={withPage} sources={sources} />)
    // The citation is the book itself (chapter and folio), not a separate list under it.
    expect(screen.queryByText(/Drawn from/)).toBeNull()
    expect(screen.getByText('2.47')).toBeTruthy()
    expect(container.querySelector('.book__lead')?.textContent).toBe('Act without craving the fruit.')
    expect(container.querySelector('.book__question')?.textContent).toBe('What would you do if the result were not yours to decide?')
    expect(container.querySelector('.reply-text')).toBeNull()
  })

  it('a reply without a page of scripture (e.g. a question) shows no citations', () => {
    render(<MessageBubble role="assistant" content="What weighs on you most?" sources={sources} />)
    expect(screen.queryByText(/Drawn from/)).toBeNull()
  })

  it('hides sources while the answer is still streaming', () => {
    render(<MessageBubble role="assistant" content="Act without" sources={sources} streaming />)
    expect(screen.queryByText(/Drawn from/)).toBeNull()
  })
})
