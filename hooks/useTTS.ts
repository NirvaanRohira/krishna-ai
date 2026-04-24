'use client'
import { useState, useCallback, useRef } from 'react'

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
  return (parts ?? [text]).map(s => s.trim()).filter(Boolean)
}

export function useTTS() {
  const [enabled, setEnabled] = useState(true)
  const enabledRef = useRef(true)

  const toggle = useCallback(() => {
    setEnabled(e => {
      enabledRef.current = !e
      return !e
    })
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  const speak = useCallback((text: string) => {
    if (!enabledRef.current || !text.trim() || !window.speechSynthesis) return
    window.speechSynthesis.cancel()

    const sentences = splitSentences(text)

    const speakNext = (index: number) => {
      if (index >= sentences.length || !enabledRef.current) return
      const utterance = new SpeechSynthesisUtterance(sentences[index])
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.lang = 'en-US'
      utterance.onend = () => speakNext(index + 1)
      utterance.onerror = () => speakNext(index + 1)
      window.speechSynthesis.speak(utterance)
    }

    speakNext(0)
  }, [])

  return { speak, stop, toggle, enabled }
}
