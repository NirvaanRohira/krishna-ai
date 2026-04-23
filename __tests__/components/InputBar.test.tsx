import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { InputBar } from '@/components/InputBar'

let mockRecognitionInstance: {
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
}

beforeEach(() => {
  mockRecognitionInstance = {
    start: vi.fn(),
    stop: vi.fn(),
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null,
    onend: null,
    onerror: null,
  }
  // plain function constructor — returning an object from `new` yields that object
  function MockSpeechRecognition() { return mockRecognitionInstance }
  Object.defineProperty(window, 'SpeechRecognition', { value: MockSpeechRecognition, writable: true, configurable: true })
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: MockSpeechRecognition, writable: true, configurable: true })
})

function makeSpeechEvent(transcript: string, isFinal: boolean): SpeechRecognitionEvent {
  return {
    results: [{
      0: { transcript },
      isFinal,
      length: 1,
    }],
    resultIndex: 0,
  } as unknown as SpeechRecognitionEvent
}

describe('InputBar', () => {
  it('renders a text input, send button, and mic button', () => {
    render(<InputBar onSubmit={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByText('Send')).toBeTruthy()
    expect(screen.getByLabelText('Start voice input')).toBeTruthy()
  })

  it('calls onSubmit with the typed message when submitted', () => {
    const onSubmit = vi.fn()
    render(<InputBar onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'I feel lost' } })
    fireEvent.click(screen.getByText('Send'))
    expect(onSubmit).toHaveBeenCalledWith('I feel lost')
  })

  it('clears the input after submit', () => {
    render(<InputBar onSubmit={vi.fn()} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'some message' } })
    fireEvent.click(screen.getByText('Send'))
    expect(input.value).toBe('')
  })

  it('does not call onSubmit when input is empty', () => {
    const onSubmit = vi.fn()
    render(<InputBar onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('Send'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits on Enter key press', () => {
    const onSubmit = vi.fn()
    render(<InputBar onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Enter key test' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('Enter key test')
  })

  it('shift+Enter does NOT submit (allows newline)', () => {
    const onSubmit = vi.fn()
    render(<InputBar onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'line one' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Cmd+Enter submits', () => {
    const onSubmit = vi.fn()
    render(<InputBar onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'cmd enter test' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', metaKey: true })
    expect(onSubmit).toHaveBeenCalledWith('cmd enter test')
  })

  it('send button and mic button are both disabled while loading', () => {
    render(<InputBar onSubmit={vi.fn()} loading />)
    expect(screen.getByText('Send')).toHaveProperty('disabled', true)
    expect(screen.getByLabelText('Start voice input')).toHaveProperty('disabled', true)
  })

  it('clicking mic starts SpeechRecognition', () => {
    render(<InputBar onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Start voice input'))
    expect(mockRecognitionInstance.start).toHaveBeenCalledOnce()
  })

  it('mic button label changes to Stop recording while listening', () => {
    render(<InputBar onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Start voice input'))
    expect(screen.getByLabelText('Stop recording')).toBeTruthy()
  })

  it('interim speech results appear live in the input', () => {
    render(<InputBar onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Start voice input'))

    act(() => {
      mockRecognitionInstance.onresult!(makeSpeechEvent('what is dhar', false))
    })

    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toContain('what is dhar')
  })

  it('final speech result is committed to the input value', () => {
    render(<InputBar onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Start voice input'))

    act(() => {
      mockRecognitionInstance.onresult!(makeSpeechEvent('what is dharma', true))
    })

    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('what is dharma')
  })

  it('clicking mic again stops recognition', () => {
    render(<InputBar onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Start voice input'))
    fireEvent.click(screen.getByLabelText('Stop recording'))
    expect(mockRecognitionInstance.stop).toHaveBeenCalledOnce()
  })

  it('recognition ending resets mic button to start state', () => {
    render(<InputBar onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Start voice input'))
    act(() => { mockRecognitionInstance.onend!() })
    expect(screen.getByLabelText('Start voice input')).toBeTruthy()
  })
})
