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

// ChatWindow mock exposes onSend so tests can drive a real send (which is how a
// sessionId gets established via the SSE 's' meta event) and renders the last
// assistant message so tests can assert on shown content.
let lastOnSend: ((message: string) => void) | null = null
type MockMsg = { role: string; content: string }
vi.mock('@/components/ChatWindow', () => ({
  ChatWindow: (props: { onSend: (message: string) => void; messages: MockMsg[] }) => {
    lastOnSend = props.onSend
    const assistantMsgs = props.messages.filter(m => m.role === 'assistant')
    const last = assistantMsgs[assistantMsgs.length - 1]
    return React.createElement('div', { 'data-testid': 'chat-window' }, last?.content ?? '')
  },
}))

vi.mock('@/components/DisclaimerBadge', () => ({
  DisclaimerBadge: () => React.createElement('div', { 'data-testid': 'disclaimer' }),
}))

// Build a Response whose body streams the given SSE data lines, so consumeStream
// can drive onMeta / onChunk / onError exactly like the real /api/chat endpoint.
function sseResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + '\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

// Drive a full send through the component so a sessionId is established.
async function startSessionViaSend(sessionId: string) {
  await act(async () => {
    lastOnSend!('hello')
    // allow fetch + stream consumption + state updates to settle
    await Promise.resolve()
    await Promise.resolve()
  })
  return sessionId
}

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

  it('registers a pagehide listener on mount (reliable mobile end signal)', async () => {
    const winAddSpy = vi.spyOn(window, 'addEventListener')
    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })

    expect(winAddSpy).toHaveBeenCalledWith('pagehide', expect.any(Function))
    winAddSpy.mockRestore()
  })

  it('sends the end-session beacon on pagehide once a session is active', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeacon, writable: true, configurable: true,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseResponse(['data: {"t":"s","id":"sess-123"}', 'data: {"t":"c","v":"Hi"}', 'data: [DONE]'])
    ))

    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })
    await startSessionViaSend('sess-123')

    act(() => { window.dispatchEvent(new Event('pagehide')) })

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, blob] = sendBeacon.mock.calls[0]
    expect(url).toBe('/api/session/end')
    const text = await (blob as Blob).text()
    expect(JSON.parse(text)).toEqual({ sessionId: 'sess-123' })
    vi.unstubAllGlobals()
  })

  it('sends the end-session beacon at most once across pagehide/visibilitychange/beforeunload', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeacon, writable: true, configurable: true,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseResponse(['data: {"t":"s","id":"sess-xyz"}', 'data: {"t":"c","v":"Hi"}', 'data: [DONE]'])
    ))

    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })
    await startSessionViaSend('sess-xyz')

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden', writable: true, configurable: true,
    })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('beforeunload'))
    })

    // Guard ref must dedupe: exactly one beacon per session end, no spamming.
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('does not schedule any timer/interval for session end (no polling/heartbeat)', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeacon, writable: true, configurable: true,
    })
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { default: ChatPage } = await import('@/app/chat/page')
    await act(async () => { render(<ChatPage />) })

    setTimeoutSpy.mockClear()
    setIntervalSpy.mockClear()

    // Hiding the tab must fire the beacon synchronously, not arm a delayed timer.
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden', writable: true, configurable: true,
    })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    expect(setTimeoutSpy).not.toHaveBeenCalled()
    expect(setIntervalSpy).not.toHaveBeenCalled()
    setTimeoutSpy.mockRestore()
    setIntervalSpy.mockRestore()
  })
})

describe('ChatPage mid-stream error handling', () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('appends an interrupted notice when the stream errors after partial content', async () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: vi.fn().mockReturnValue(true), writable: true, configurable: true,
    })
    // Stream partial content, then a server error event mid-stream.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"t":"s","id":"sess-err"}',
        'data: {"t":"c","v":"Half an answer."}',
        'data: {"t":"e","msg":"upstream failed"}',
        'data: [DONE]',
      ])
    ))

    const { default: ChatPage } = await import('@/app/chat/page')
    const { findByTestId } = await (async () => {
      let r!: ReturnType<typeof render>
      await act(async () => { r = render(<ChatPage />) })
      return r
    })()

    await act(async () => {
      lastOnSend!('hello')
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })

    const win = await findByTestId('chat-window')
    // Partial content is preserved AND clearly marked as interrupted.
    expect(win.textContent).toContain('Half an answer.')
    expect(win.textContent).toContain('response was interrupted')
  })

  it('shows only the error (no interrupted notice) when nothing was assembled', async () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: vi.fn().mockReturnValue(true), writable: true, configurable: true,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"t":"s","id":"sess-err2"}',
        'data: {"t":"e","msg":"boom"}',
        'data: [DONE]',
      ])
    ))

    const { default: ChatPage } = await import('@/app/chat/page')
    const { findByTestId } = await (async () => {
      let r!: ReturnType<typeof render>
      await act(async () => { r = render(<ChatPage />) })
      return r
    })()

    await act(async () => {
      lastOnSend!('hello')
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })

    const win = await findByTestId('chat-window')
    expect(win.textContent).toContain('boom')
    expect(win.textContent).not.toContain('response was interrupted')
  })
})
