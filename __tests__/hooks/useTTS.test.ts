import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTTS } from '@/hooks/useTTS'

const mockSpeak = vi.fn()
const mockCancel = vi.fn()
let mockPaused = false
let mockSpeaking = false

class MockSpeechSynthesisUtterance {
  text: string; rate = 1; pitch = 1
  constructor(text: string) { this.text = text }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSpeaking = false
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: MockSpeechSynthesisUtterance, writable: true, configurable: true,
  })
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      speak: mockSpeak,
      cancel: mockCancel,
      get paused() { return mockPaused },
      get speaking() { return mockSpeaking },
      getVoices: () => [],
    },
    writable: true,
    configurable: true,
  })
})

describe('useTTS', () => {
  it('exposes speak, stop, and enabled toggle', () => {
    const { result } = renderHook(() => useTTS())
    expect(typeof result.current.speak).toBe('function')
    expect(typeof result.current.stop).toBe('function')
    expect(typeof result.current.toggle).toBe('function')
    expect(typeof result.current.enabled).toBe('boolean')
  })

  it('is enabled by default', () => {
    const { result } = renderHook(() => useTTS())
    expect(result.current.enabled).toBe(true)
  })

  it('toggle switches enabled off then on', () => {
    const { result } = renderHook(() => useTTS())
    act(() => { result.current.toggle() })
    expect(result.current.enabled).toBe(false)
    act(() => { result.current.toggle() })
    expect(result.current.enabled).toBe(true)
  })

  it('does not fetch TTS audio when disabled', () => {
    const fetchMock = vi.fn()
    Object.defineProperty(global, 'fetch', { value: fetchMock, writable: true, configurable: true })
    const { result } = renderHook(() => useTTS())
    act(() => { result.current.toggle() }) // disable
    act(() => { result.current.enqueue('something') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not enqueue empty strings', () => {
    const fetchMock = vi.fn()
    Object.defineProperty(global, 'fetch', { value: fetchMock, writable: true, configurable: true })
    const { result } = renderHook(() => useTTS())
    act(() => { result.current.enqueue('') })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// --- Generation-cancel behavior (bug 3 / 4 / 5) ---------------------------
// The hook streams audio via fetch('/api/tts') + new Audio(). These tests
// drive that real path (not the stale speechSynthesis mocks above).

interface DeferredFetch {
  promise: Promise<Response>
  resolve: (blob: Blob) => void
}

function deferredResponse(): DeferredFetch {
  let resolveFn!: (blob: Blob) => void
  const promise = new Promise<Response>((res) => {
    resolveFn = (blob: Blob) => res({ ok: true, blob: async () => blob } as unknown as Response)
  })
  return { promise, resolve: resolveFn }
}

describe('useTTS generation-cancel', () => {
  let createdAudios: MockAudio[]
  let revoked: string[]
  let playRejections: boolean[]

  class MockAudio {
    src: string
    onended: (() => void) | null = null
    onerror: (() => void) | null = null
    play: ReturnType<typeof vi.fn>
    pause = vi.fn()
    constructor(src: string) {
      this.src = src
      const shouldReject = playRejections.shift() ?? false
      this.play = shouldReject
        ? vi.fn().mockRejectedValue(new Error('NotAllowedError'))
        : vi.fn().mockResolvedValue(undefined)
      createdAudios.push(this)
    }
  }

  beforeEach(() => {
    createdAudios = []
    revoked = []
    playRejections = []
    Object.defineProperty(window, 'Audio', {
      value: MockAudio, writable: true, configurable: true,
    })
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock-url'), writable: true, configurable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn((u: string) => { revoked.push(u) }), writable: true, configurable: true,
    })
  })

  it('does not play a stale sentence after stop() during an in-flight fetch (bug 3)', async () => {
    const deferred = deferredResponse()
    const fetchMock = vi.fn().mockReturnValue(deferred.promise)
    Object.defineProperty(global, 'fetch', { value: fetchMock, writable: true, configurable: true })

    const { result } = renderHook(() => useTTS())

    // Enqueue sentence A — starts processNext, awaits the (deferred) fetch.
    act(() => { result.current.enqueue('stale sentence') })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // User interrupts: stop() bumps the generation counter.
    act(() => { result.current.stop() })

    // Now the in-flight fetch resolves — but the captured generation is stale,
    // so no Audio should be constructed or played.
    await act(async () => {
      deferred.resolve(new Blob(['audio']))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createdAudios.length).toBe(0)
  })

  it('lets a fresh enqueue play after stop() without overlapping the stale one (bug 3)', async () => {
    const first = deferredResponse()
    const second = deferredResponse()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    Object.defineProperty(global, 'fetch', { value: fetchMock, writable: true, configurable: true })

    const { result } = renderHook(() => useTTS())

    act(() => { result.current.enqueue('stale') })
    act(() => { result.current.stop() })
    act(() => { result.current.enqueue('fresh') })

    // Resolve the stale fetch first — must be discarded.
    await act(async () => {
      first.resolve(new Blob(['stale-audio']))
      await Promise.resolve(); await Promise.resolve()
    })
    expect(createdAudios.length).toBe(0)

    // Resolve the fresh fetch — it should play exactly one audio.
    await act(async () => {
      second.resolve(new Blob(['fresh-audio']))
      await Promise.resolve(); await Promise.resolve()
    })
    expect(createdAudios.length).toBe(1)
    expect(createdAudios[0].play).toHaveBeenCalledOnce()
  })

  it('recovers the queue when audio.play() rejects (bug 4)', async () => {
    const a = deferredResponse()
    const b = deferredResponse()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise)
    Object.defineProperty(global, 'fetch', { value: fetchMock, writable: true, configurable: true })

    // First Audio rejects play() (autoplay policy); processNext must continue.
    playRejections = [true]

    const { result } = renderHook(() => useTTS())
    act(() => { result.current.enqueue('one') })
    act(() => { result.current.enqueue('two') })

    // Resolve first fetch → first audio created → play() rejects.
    await act(async () => {
      a.resolve(new Blob(['a']))
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })
    expect(createdAudios.length).toBe(1)

    // The queue must not be permanently stalled: the rejected play() should
    // trigger processNext, which fetches sentence two.
    await act(async () => {
      b.resolve(new Blob(['b']))
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })
    expect(createdAudios.length).toBe(2)
  })
})

describe('useTTS phrase cache', () => {
  it('synthesises a repeated short phrase only once', async () => {
    const created: unknown[] = []
    class MockAudio {
      onended: (() => void) | null = null
      onerror: (() => void) | null = null
      play = vi.fn().mockResolvedValue(undefined)
      pause = vi.fn()
      constructor() { created.push(this) }
    }
    Object.defineProperty(window, 'Audio', { value: MockAudio, writable: true, configurable: true })
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), writable: true, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true, configurable: true })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['a']) })
    Object.defineProperty(global, 'fetch', { value: fetchMock, writable: true, configurable: true })

    const { result } = renderHook(() => useTTS())
    await act(async () => {
      result.current.enqueue('Hmm...')
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })
    expect(created.length).toBe(1)
    ;(created[0] as MockAudio).onended?.()

    act(() => { result.current.stop() })
    await act(async () => {
      result.current.enqueue('Hmm...')
      await Promise.resolve(); await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(created.length).toBe(2)
  })
})
