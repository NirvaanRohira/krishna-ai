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

  it('speak calls speechSynthesis.speak with an utterance', () => {
    const { result } = renderHook(() => useTTS())
    act(() => { result.current.speak('What is dharma?') })
    expect(mockSpeak).toHaveBeenCalledOnce()
    const utterance = mockSpeak.mock.calls[0][0]
    expect(utterance).toBeInstanceOf(MockSpeechSynthesisUtterance)
    expect(utterance.text).toBe('What is dharma?')
  })

  it('does not call speechSynthesis.speak when disabled', () => {
    const { result } = renderHook(() => useTTS())
    act(() => { result.current.toggle() }) // disable
    act(() => { result.current.speak('something') })
    expect(mockSpeak).not.toHaveBeenCalled()
  })

  it('stop calls speechSynthesis.cancel', () => {
    const { result } = renderHook(() => useTTS())
    act(() => { result.current.stop() })
    expect(mockCancel).toHaveBeenCalledOnce()
  })

  it('speak splits text on sentence boundaries and chains each via onend', () => {
    // make mock fire onend synchronously so chaining works in test
    mockSpeak.mockImplementation((u: SpeechSynthesisUtterance) => {
      u.onend?.(new Event('end') as SpeechSynthesisEvent)
    })
    const { result } = renderHook(() => useTTS())
    act(() => { result.current.speak('First sentence. Second sentence. Third.') })
    expect(mockSpeak).toHaveBeenCalledTimes(3)
  })

  it('does not speak empty strings', () => {
    const { result } = renderHook(() => useTTS())
    act(() => { result.current.speak('') })
    expect(mockSpeak).not.toHaveBeenCalled()
  })

  it('speak handles text without sentence-ending punctuation', () => {
    const { result } = renderHook(() => useTTS())
    act(() => { result.current.speak('no punctuation here') })
    expect(mockSpeak).toHaveBeenCalledOnce()
  })
})
