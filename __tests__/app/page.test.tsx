import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import Page from '@/app/page'

describe('Home page', () => {
  it('renders the product name', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1, name: /kanha/i })).toBeInTheDocument()
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
