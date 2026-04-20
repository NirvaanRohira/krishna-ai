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
})
