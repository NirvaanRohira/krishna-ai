'use client'
import { useState, useCallback, useLayoutEffect, useRef } from 'react'

// Short phrases ("Hmm...", "Let me reflect on this...", greetings) repeat constantly.
// Cache their audio in memory so each is synthesised once per page load, not once per
// message — the thinking phrase alone used to cost a TTS call on almost every turn.
const PHRASE_CACHE_MAX_CHARS = 120
const PHRASE_CACHE_MAX_ENTRIES = 40

export function useTTS({ defaultEnabled = true }: { defaultEnabled?: boolean } = {}) {
  const [enabled, setEnabled] = useState(defaultEnabled)
  const enabledRef = useRef(defaultEnabled)
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
  const phraseCacheRef = useRef(new Map<string, Blob>())

  // One AudioContext for the page's lifetime (browsers cap how many can exist, and the
  // old code created a fresh one on every send). It is unlocked on a user gesture and,
  // when analysis is on, playback is routed through an AnalyserNode that drives the
  // avatar's lip-sync.
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const analyseRef = useRef(false)

  const toggle = useCallback(() => {
    setEnabled(e => { enabledRef.current = !e; return !e })
  }, [])

  const setEnabledExplicit = useCallback((on: boolean) => {
    enabledRef.current = on
    setEnabled(on)
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

  const getContext = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current
    if (typeof window === 'undefined') return null
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    ctxRef.current = new AudioCtx()
    return ctxRef.current
  }, [])

  /** The analyser feeding lip-sync, or null when analysis is off / unsupported. */
  const getAnalyser = useCallback((): AnalyserNode | null => {
    if (!analyseRef.current) return null
    const ctx = getContext()
    if (!ctx) return null
    if (!analyserRef.current) {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.5
      analyser.connect(ctx.destination)
      analyserRef.current = analyser
    }
    return analyserRef.current
  }, [getContext])

  /** Route TTS playback through the analyser (avatar mode) or play it directly. */
  const setAnalyse = useCallback((on: boolean) => {
    analyseRef.current = on
  }, [])

  const attachToAnalyser = useCallback((audio: HTMLAudioElement) => {
    const analyser = getAnalyser()
    const ctx = ctxRef.current
    if (!analyser || !ctx) return
    try {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      ctx.createMediaElementSource(audio).connect(analyser)
    } catch { /* element already attached / unsupported — plays without lip-sync */ }
  }, [getAnalyser])

  // processNext re-schedules itself from audio callbacks. Recursion goes through a ref
  // (React 19 forbids a callback reading its own binding before declaration).
  const processNextRef = useRef<() => void>(() => {})

  const processNext = useCallback(async () => {
    if (!enabledRef.current || queueRef.current.length === 0) {
      processingRef.current = false
      return
    }
    processingRef.current = true
    const gen = generationRef.current
    const text = queueRef.current.shift()!
    try {
      let blob = phraseCacheRef.current.get(text)
      if (!blob) {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        // A stop() during the fetch invalidates this generation — drop the stale result.
        if (gen !== generationRef.current) return
        if (!res.ok || !enabledRef.current) { processNextRef.current(); return }
        blob = await res.blob()
        if (gen !== generationRef.current) return
        if (text.length <= PHRASE_CACHE_MAX_CHARS) {
          const cache = phraseCacheRef.current
          if (cache.size >= PHRASE_CACHE_MAX_ENTRIES) {
            const oldest = cache.keys().next().value
            if (oldest !== undefined) cache.delete(oldest)
          }
          cache.set(text, blob)
        }
      }
      if (!enabledRef.current) { processNextRef.current(); return }
      const url = URL.createObjectURL(blob)
      currentUrlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio
      attachToAnalyser(audio)
      const release = () => {
        URL.revokeObjectURL(url)
        if (currentUrlRef.current === url) currentUrlRef.current = null
      }
      audio.onended = () => { release(); processNextRef.current() }
      audio.onerror = () => { release(); processNextRef.current() }
      // play() can reject (autoplay policy) — recover the queue instead of stalling (bug 4).
      audio.play().catch(() => { release(); processNextRef.current() })
    } catch {
      if (gen !== generationRef.current) return
      processNextRef.current()
    }
  }, [attachToAnalyser])
  useLayoutEffect(() => { processNextRef.current = processNext }, [processNext])

  // Unlock audio (iOS Safari) — call during a user gesture (e.g. send button).
  const unlockAudio = useCallback(() => {
    const ctx = getContext()
    if (!ctx) return
    try {
      const buf = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0)
    } catch { /* ignore */ }
    ctx.resume().catch(() => {})
  }, [getContext])

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

  return {
    speak, enqueue, stop, toggle, enabled, unlockAudio,
    setEnabled: setEnabledExplicit, setAnalyse, getAnalyser,
  }
}
