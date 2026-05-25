import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/supabase', () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({ enqueue: vi.fn(), stop: vi.fn(), toggle: vi.fn(), enabled: false, unlockAudio: vi.fn(), speak: vi.fn() }),
}))
vi.mock('@/components/ChatWindow', () => ({
  ChatWindow: () => React.createElement('div', { 'data-testid': 'chat-window' }),
}))
vi.mock('@/components/DisclaimerBadge', () => ({
  DisclaimerBadge: () => React.createElement('div', { 'data-testid': 'disclaimer' }),
}))

describe('ChatPage video toggle', () => {
  it('renders a video mode toggle button', async () => {
    vi.resetModules()
    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })
    const btn = screen.getByRole('button', { name: /video/i })
    expect(btn).toBeTruthy()
  })

  it('shows a Coming Soon message when the video toggle is clicked', async () => {
    vi.resetModules()
    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })
    const btn = screen.getByRole('button', { name: /video/i })
    fireEvent.click(btn)
    expect(screen.getByText(/coming soon/i)).toBeTruthy()
  })

  it('does not render a video element by default (text chat is the default mode)', async () => {
    vi.resetModules()
    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })
    expect(screen.queryByRole('main')?.querySelector('video')).toBeNull()
  })
})
