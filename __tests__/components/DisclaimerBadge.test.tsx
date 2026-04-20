import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisclaimerBadge } from '@/components/DisclaimerBadge'

describe('DisclaimerBadge', () => {
  it('renders without crashing', () => {
    render(<DisclaimerBadge />)
  })

  it('mentions AI', () => {
    render(<DisclaimerBadge />)
    expect(screen.getByText(/AI/i)).toBeTruthy()
  })

  it('mentions Sanskrit texts or sacred texts', () => {
    render(<DisclaimerBadge />)
    expect(screen.getByText(/Sanskrit|sacred text/i)).toBeTruthy()
  })

  it('clarifies it is not a spiritual authority', () => {
    render(<DisclaimerBadge />)
    expect(screen.getByText(/not a spiritual authority|not.*authority/i)).toBeTruthy()
  })
})
