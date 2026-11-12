import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVoiceConversation, END_OF_TURN_MS, MAX_EMPTY_SESSIONS, recognitionLang } from '@/hooks/useVoiceConversation'

// A stand-in for the browser's speech recogniser that the test drives by hand.
class FakeRecognition {
  static instances: FakeRecognition[] = []
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  started = false
  aborted = false
  constructor() { FakeRecognition.instances.push(this) }
  start() { this.started = true }
  stop() { this.onend?.() }
  abort() { this.aborted = true }
  say(text: string, isFinal: boolean) {
    const result = Object.assign([{ transcript: text, confidence: 1 }], { isFinal })
    this.onresult?.({ resultIndex: 0, results: [result] })
  }
  end() { this.onend?.() }
}
const live = () => FakeRecognition.instances.filter((r) => r.started && !r.aborted).at(-1)
const speaking = (on: boolean) => act(() => { window.dispatchEvent(new CustomEvent('kanha:speaking', { detail: on })) })

beforeEach(() => {
  vi.useFakeTimers()
  FakeRecognition.instances = []
  ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
})

function setup(loading = false) {
  const onUtterance = vi.fn()
  const onInterrupt = vi.fn()
  const hook = renderHook((p: { loading: boolean }) => useVoiceConversation({ lang: 'en', loading: p.loading, onUtterance, onInterrupt }), { initialProps: { loading } })
  act(() => { vi.advanceTimersByTime(1) })
  return { ...hook, onUtterance, onInterrupt }
}

describe('voice conversation', () => {
  it('listens as soon as it opens, and sends the turn after a pause, with no button', () => {
    const { result, onUtterance } = setup()
    expect(result.current.state).toBe('listening')
    act(() => { live()!.say('I feel lost', true) })
    act(() => { live()!.say(' at work', false) })
    expect(result.current.heard).toBe('I feel lost at work')
    act(() => { vi.advanceTimersByTime(END_OF_TURN_MS - 100) })
    expect(onUtterance).not.toHaveBeenCalled() // a reflective pause isn't the end yet
    act(() => { vi.advanceTimersByTime(200) })
    expect(onUtterance).toHaveBeenCalledWith('I feel lost at work')
    expect(result.current.state).toBe('thinking')
    expect(live()).toBeUndefined() // the mic is closed while he answers
  })

  it('keeps the mic closed while Kanha speaks, then listens again', () => {
    const { result, rerender } = setup()
    act(() => { live()!.say('hello', true) })
    act(() => { vi.advanceTimersByTime(END_OF_TURN_MS + 10) })
    rerender({ loading: true })
    speaking(true)
    expect(result.current.state).toBe('speaking')
    expect(live()).toBeUndefined()
    rerender({ loading: false })
    speaking(false)
    act(() => { vi.advanceTimersByTime(700) })
    expect(result.current.state).toBe('listening')
    expect(live()).toBeDefined()
  })

  it('tapping while he speaks interrupts him and listens', () => {
    const { result, onInterrupt } = setup()
    speaking(true)
    act(() => { result.current.tap() })
    expect(onInterrupt).toHaveBeenCalled()
    expect(result.current.state).toBe('listening')
  })

  it('tapping while listening sends what was said, or pauses if nothing was', () => {
    const { result, onUtterance } = setup()
    act(() => { result.current.tap() })
    expect(result.current.state).toBe('off')
    act(() => { result.current.tap() })
    expect(result.current.state).toBe('listening')
    act(() => { live()!.say('one thing', false) })
    act(() => { result.current.tap() })
    expect(onUtterance).toHaveBeenCalledWith('one thing')
  })

  it('pauses after several silent sessions instead of listening forever', () => {
    const { result } = setup()
    for (let i = 0; i < MAX_EMPTY_SESSIONS; i++) {
      act(() => { live()!.end() })
      act(() => { vi.advanceTimersByTime(300) })
    }
    expect(result.current.state).toBe('off')
  })

  it('falls back to typing where voice is unavailable or the mic is refused', () => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    const a = setup()
    expect(a.result.current.state).toBe('unsupported')
    a.unmount()
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition
    const b = setup()
    act(() => { live()!.onerror?.({ error: 'not-allowed' }) })
    expect(b.result.current.state).toBe('denied')
  })

  it('a reply with no voice (voice failed) still hands the turn back', () => {
    const { result, rerender } = setup()
    act(() => { live()!.say('hello', true) })
    act(() => { vi.advanceTimersByTime(END_OF_TURN_MS + 10) })
    rerender({ loading: true })
    rerender({ loading: false })
    expect(result.current.state).toBe('thinking')
    act(() => { vi.advanceTimersByTime(4100) })
    expect(result.current.state).toBe('listening')
  })

  it('recognises Hindi when the interface is Hindi, Indian English otherwise', () => {
    expect(recognitionLang('hi', 'en-US')).toBe('hi-IN')
    expect(recognitionLang('en', 'en-US')).toBe('en-IN')
    expect(recognitionLang('en', 'ta-IN')).toBe('ta-IN')
  })
})
