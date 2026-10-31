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

  it('shows the verses an answer drew on once streaming finishes', () => {
    render(<MessageBubble role="assistant" content="Act without craving the fruit." sources={sources} />)
    expect(screen.getByText(/Drawn from/)).toBeTruthy()
    expect(screen.getByText('Gita 2.47')).toBeTruthy()
    expect(screen.getByText('Bhagavad Gita 2.47')).toBeTruthy()
  })

  it('hides sources while the answer is still streaming', () => {
    render(<MessageBubble role="assistant" content="Act without" sources={sources} streaming />)
    expect(screen.queryByText(/Drawn from/)).toBeNull()
  })
})
