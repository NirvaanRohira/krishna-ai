'use client'
import { useState, useRef, useEffect } from 'react'
import { useLang } from '@/components/LangProvider'

interface InputBarProps {
  onSubmit: (message: string) => void
  loading?: boolean
}

// SVG mic icon
function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10a7 7 0 0 0 14 0"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
      <line x1="9" y1="21" x2="15" y2="21"/>
    </svg>
  )
}

// SVG stop icon (square)
function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  )
}

// SVG send icon
function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}

export function InputBar({ onSubmit, loading = false }: InputBarProps) {
  const { lang, t } = useLang()
  const [value, setValue] = useState('')
  const [interim, setInterim] = useState('')
  const [recording, setRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const baseValueRef = useRef('')
  const committedRef = useRef('')

  // Stop recognition if the component unmounts mid-recording so the mic doesn't stay live
  // and onresult can't setState on an unmounted component (bug 2).
  useEffect(() => () => {
    const r = recognitionRef.current
    if (r) { r.onresult = null; r.onend = null; r.onerror = null; r.stop() }
  }, [])

  function submit() {
    const text = (value + interim).trim()
    if (!text) return
    onSubmit(text)
    setValue('')
    setInterim('')
    // Reset the speech accumulators so continued dictation after a send starts clean
    // instead of resurrecting (and re-sending) the already-sent text (bug 1).
    committedRef.current = ''
    baseValueRef.current = ''
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') return
    if (e.shiftKey) return
    e.preventDefault()
    submit()
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    // Manual edits become the new base for subsequent speech, and reset the committed-speech
    // buffer so dictation appends to (not clobbers) what the user typed (bug 1).
    baseValueRef.current = e.target.value
    committedRef.current = ''
  }

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop()
      return
    }

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) {
      alert(t('input.no_voice'))
      return
    }

    baseValueRef.current = value
    committedRef.current = ''

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    // Indian English understands Indian accents and names far better than en-US; a phone set
    // to Hindi/Tamil/etc. (hi-IN, ta-IN...) gets recognition in that language.
    // Hindi chosen for the interface means Hindi speech recognition.
    const navLang = typeof navigator !== 'undefined' ? navigator.language : ''
    recognition.lang = lang === 'hi' ? 'hi-IN' : /-IN$/i.test(navLang) ? navLang : 'en-IN'
    recognitionRef.current = recognition

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) committedRef.current += e.results[i][0].transcript
        else interimText += e.results[i][0].transcript
      }
      setValue(baseValueRef.current + committedRef.current)
      setInterim(interimText)
    }

    recognition.onend = () => { setRecording(false); setInterim('') }
    recognition.onerror = () => { setRecording(false); setInterim('') }
    recognition.start()
    setRecording(true)
  }

  const displayValue = value + interim
  const canSend = displayValue.trim().length > 0 && !loading

  return (
    <div className="input-bar">
      <textarea
        rows={1}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={recording ? t('input.listening') : t('input.placeholder')}
        disabled={loading}
        className="input-bar__textarea"
        aria-label={t('input.label')}
      />

      <button
        onClick={toggleRecording}
        disabled={loading}
        className={`input-bar__icon-btn${recording ? ' input-bar__icon-btn--recording' : ''}`}
        title={recording ? t('input.voice_stop') : t('input.voice')}
        aria-label={recording ? t('input.voice_stop') : t('input.voice_start')}
        type="button"
      >
        {recording ? <StopIcon /> : <MicIcon />}
      </button>

      <button
        onClick={submit}
        disabled={!canSend}
        className="input-bar__send"
        title={t('input.send')}
        aria-label={t('input.send_label')}
        type="button"
      >
        <SendIcon />
      </button>
    </div>
  )
}
