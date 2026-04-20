import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Page from '@/app/page'

describe('Home page', () => {
  it('renders the product name', () => {
    // This test fails (RED) because app/page.tsx has create-next-app default content
    render(<Page />)
    expect(screen.getByText(/krishna ai/i)).toBeInTheDocument()
  })

  it('shows a call-to-action link to begin a conversation', () => {
    render(<Page />)
    const cta = screen.getByRole('link', { name: /begin|start|enter/i })
    expect(cta).toBeInTheDocument()
    expect(cta).toHaveAttribute('href', '/login')
  })

  it('displays the disclaimer text', () => {
    render(<Page />)
    expect(
      screen.getByText(/ai drawing from sanskrit texts/i)
    ).toBeInTheDocument()
  })
})
