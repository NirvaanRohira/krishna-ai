import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

vi.mock('@/hooks/usePlan', () => ({
  usePlan: () => ({ plan: 'free', validUntil: null, signedIn: true, loaded: true, refresh: () => {} }),
  formatPlanDate: () => '',
  PLAN_NAMES: { free: 'Free', plus: 'Plus', premium: 'Premium' },
}))
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
vi.mock('@/components/AvatarPanel', () => ({
  default: (_props: { onClose: () => void }) =>
    React.createElement('div', { 'data-testid': 'avatar-panel' }, 'Krishna avatar'),
}))

describe('ChatPage avatar toggle', () => {
  it('renders an avatar mode toggle button', async () => {
    vi.resetModules()
    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })
    const btn = screen.getByRole('button', { name: /avatar/i })
    expect(btn).toBeTruthy()
  })

  it('shows the 3D avatar panel when the avatar toggle is clicked', async () => {
    vi.resetModules()
    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })
    const btn = screen.getByRole('button', { name: /avatar/i })
    fireEvent.click(btn)
    expect(screen.getByTestId('avatar-panel')).toBeTruthy()
  })

  it('does not render the avatar by default (text chat is the default mode)', async () => {
    vi.resetModules()
    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })
    expect(screen.queryByTestId('avatar-panel')).toBeNull()
  })
})
