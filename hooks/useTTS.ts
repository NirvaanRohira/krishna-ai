'use client'
import { useState, useCallback, useRef } from 'react'

export function useTTS() {
  const [enabled, setEnabled] = useState(true)
  const enabledRef = useRef(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<string[]>([])
  const processingRef = useRef(false)

  const toggle = useCallback(() => {
    setEnabled(e => { enabledRef.current = !e; return !e })
  }, [])

  const stop = useCallback(() => {
    queueRef.current = []
    processingRef.current = false
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
  }, [])

  const processNext = useCallback(async () => {
    if (!enabledRef.current || queueRef.current.length === 0) {
      processingRef.current = false
      return
    }
    processingRef.current = true
    const text = queueRef.current.shift()!
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok || !enabledRef.current) { processNext(); return }
      const blob = await res.blob()
      if (!enabledRef.current) { processNext(); return }
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { URL.revokeObjectURL(url); processNext() }
      audio.onerror = () => { URL.revokeObjectURL(url); processNext() }
      audio.play()
    } catch {
      processNext()
    }
  }, [])

  // Enqueue a sentence — starts playing immediately if idle
  const enqueue = useCallback((text: string) => {
    if (!enabledRef.current || !text.trim()) return
    queueRef.current.push(text.trim())
    if (!processingRef.current) processNext()
  }, [processNext])

  // speak: stop current, replace queue (used for non-streaming fallback)
  const speak = useCallback((text: string) => {
    stop()
    enqueue(text)
  }, [stop, enqueue])

  return { speak, enqueue, stop, toggle, enabled }
}
