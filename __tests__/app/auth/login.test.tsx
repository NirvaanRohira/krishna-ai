import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockSignInWithOtp = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createBrowserSupabaseClient: vi.fn(() => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
    },
  })),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignInWithOtp.mockResolvedValue({ error: null })
  })

  it('renders an email input', async () => {
    const { default: LoginPage } = await import('@/app/(auth)/login/page')
    render(<LoginPage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toBeDefined()
  })

  it('renders a submit button', async () => {
    const { default: LoginPage } = await import('@/app/(auth)/login/page')
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /send/i })).toBeDefined()
  })

  it('calls signInWithOtp with the entered email on submit', async () => {
    const { default: LoginPage } = await import('@/app/(auth)/login/page')
    render(<LoginPage />)
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' })
      )
    })
  })

  it('shows a confirmation message after successful submit', async () => {
    const { default: LoginPage } = await import('@/app/(auth)/login/page')
    render(<LoginPage />)
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeDefined()
    })
  })
})
