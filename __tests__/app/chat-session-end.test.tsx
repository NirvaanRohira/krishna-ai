import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'

// ── Mock all ChatPage dependencies ───────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({
    enqueue: vi.fn(),
    stop: vi.fn(),
    toggle: vi.fn(),
    enabled: true,
    unlockAudio: vi.fn(),
    speak: vi.fn(),
  }),
}))

vi.mock('@/components/ChatWindow', () => ({
  ChatWindow: () => React.createElement('div', { 'data-testid': 'chat-window' }),
}))

vi.mock('@/components/DisclaimerBadge', () => ({
  DisclaimerBadge: () => React.createElement('div', { 'data-testid': 'disclaimer' }),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('ChatPage session lifecycle', () => {
  let addSpy: ReturnType<typeof vi.spyOn>
  let removeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    addSpy = vi.spyOn(document, 'addEventListener')
    removeSpy = vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('registers a visibilitychange listener on mount', async () => {
    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })

    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('removes the visibilitychange listener on unmount', async () => {
    const { default: ChatPage } = await import('@/app/chat/page')
    let unmount!: () => void
    await act(async () => { ({ unmount } = render(<ChatPage />)) })

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('does not call sendBeacon when sessionId is null (no active session)', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeacon,
      writable: true,
      configurable: true,
    })

    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })

    // Trigger visibilitychange with no active sessionId
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    // No session started → sendBeacon must not fire
    expect(sendBeacon).not.toHaveBeenCalled()
  })
})
