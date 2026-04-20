import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatWindow } from '@/components/ChatWindow'

const MESSAGES = [
  { role: 'user' as const, content: 'My brother wronged me' },
  { role: 'assistant' as const, content: 'The Gita speaks of this directly. What weighs heavier — the action or your response to it?' },
]

describe('ChatWindow', () => {
  it('renders all messages', () => {
    render(<ChatWindow messages={MESSAGES} onSend={vi.fn()} loading={false} />)
    expect(screen.getByText('My brother wronged me')).toBeTruthy()
    expect(screen.getByText(/The Gita speaks of this directly/)).toBeTruthy()
  })

  it('renders an InputBar', () => {
    render(<ChatWindow messages={[]} onSend={vi.fn()} loading={false} />)
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('renders an empty state when there are no messages', () => {
    render(<ChatWindow messages={[]} onSend={vi.fn()} loading={false} />)
    expect(screen.queryByText(/My brother/)).toBeNull()
  })

  it('passes loading state to InputBar, disabling input while waiting', () => {
    render(<ChatWindow messages={[]} onSend={vi.fn()} loading={true} />)
    expect(screen.getByRole('button')).toHaveProperty('disabled', true)
  })
})
