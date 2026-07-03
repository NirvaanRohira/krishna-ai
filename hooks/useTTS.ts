'use client'
import { useState, useCallback, useRef } from 'react'

export function useTTS() {
  const [enabled, setEnabled] = useState(true)
  const enabledRef = useRef(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<string[]>([])
  const processingRef = useRef(false)
  // Bumped on every stop(). Any in-flight processNext whose captured generation no longer
  // matches must bail before constructing/playing audio — otherwise a stale sentence plays
  // over the new response, and a second processNext chain overlaps the first (bug 3).
  const generationRef = useRef(0)
  // The object URL currently owned by audioRef. stop() sets audio.src = '' which suppresses
  // onended/onerror, so their revoke never runs — we revoke this directly instead (bug 5).
  const currentUrlRef = useRef<string | null>(null)

  const toggle = useCallback(() => {
    setEnabled(e => { enabledRef.current = !e; return !e })
  }, [])

  const stop = useCallback(() => {
    generationRef.current++
    queueRef.current = []
    processingRef.current = false
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current)
      currentUrlRef.current = null
    }
  }, [])

  const processNext = useCallback(async () => {
    if (!enabledRef.current || queueRef.current.length === 0) {
      processingRef.current = false
      return
    }
    processingRef.current = true
    const gen = generationRef.current
    const text = queueRef.current.shift()!
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      // A stop() during the fetch invalidates this generation — drop the stale result.
      if (gen !== generationRef.current) return
      if (!res.ok || !enabledRef.current) { processNext(); return }
      const blob = await res.blob()
      if (gen !== generationRef.current) return
      if (!enabledRef.current) { processNext(); return }
      const url = URL.createObjectURL(blob)
      currentUrlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio
      const release = () => {
        URL.revokeObjectURL(url)
        if (currentUrlRef.current === url) currentUrlRef.current = null
      }
      audio.onended = () => { release(); processNext() }
      audio.onerror = () => { release(); processNext() }
      // play() can reject (autoplay policy) — recover the queue instead of stalling (bug 4).
      audio.play().catch(() => { release(); processNext() })
    } catch {
      if (gen !== generationRef.current) return
      processNext()
    }
  }, [])

  // Unlock iOS Safari audio — call during a user gesture (e.g. send button)
  const unlockAudio = useCallback(() => {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
    ctx.resume().catch(() => {})
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

  return { speak, enqueue, stop, toggle, enabled, unlockAudio }
}
