'use client'
import { useState, useRef } from 'react'

interface InputBarProps {
  onSubmit: (message: string) => void
  loading?: boolean
}

export function InputBar({ onSubmit, loading = false }: InputBarProps) {
  const [value, setValue] = useState('')
  const [interim, setInterim] = useState('')
  const [recording, setRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const baseValueRef = useRef('')   // text in box before recording started
  const committedRef = useRef('')   // finalized transcript chunks this session

  function submit() {
    const text = (value + interim).trim()
    if (!text) return
    onSubmit(text)
    setValue('')
    setInterim('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') return
    if (e.shiftKey) return
    e.preventDefault()
    submit()
  }

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop()
      return
    }

    const SR = (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      ?? (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition

    if (!SR) {
      alert('Your browser does not support voice input. Try Chrome or Edge.')
      return
    }

    baseValueRef.current = value
    committedRef.current = ''

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          committedRef.current += e.results[i][0].transcript
        } else {
          interimText += e.results[i][0].transcript
        }
      }
      setValue(baseValueRef.current + committedRef.current)
      setInterim(interimText)
    }

    recognition.onend = () => {
      setRecording(false)
      setInterim('')
    }

    recognition.onerror = () => {
      setRecording(false)
      setInterim('')
    }

    recognition.start()
    setRecording(true)
  }

  const displayValue = value + interim

  return (
    <div className="input-bar">
      <textarea
        rows={1}
        value={displayValue}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={recording ? 'Listening…' : 'Ask your question…'}
        disabled={loading}
        className="input-bar__textarea"
      />
      <button
        onClick={toggleRecording}
        disabled={loading}
        className={`input-bar__mic ${recording ? 'input-bar__mic--active' : ''}`}
        title={recording ? 'Stop recording' : 'Start voice input'}
        aria-label={recording ? 'Stop recording' : 'Start voice input'}
      >
        {recording ? '⏹' : '🎙'}
      </button>
      <button onClick={submit} disabled={loading}>
        Send
      </button>
    </div>
  )
}
