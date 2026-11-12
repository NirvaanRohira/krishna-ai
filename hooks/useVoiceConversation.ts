'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Hands-free voice conversation for avatar mode: listen → (pause) → send → Kanha speaks →
// listen again. No text box and no send button. Uses the browser's own speech recognition
// (the same one the mic button in text mode uses), so there is no extra server cost.
//
// The mic is never open while Kanha speaks (so it can't hear itself) or while a reply is
// being written. Tapping the orb interrupts Kanha, sends what you've said so far, or pauses.

export type VoiceState = 'off' | 'listening' | 'thinking' | 'speaking' | 'unsupported' | 'denied'

/** Silence after the last words before the turn is sent. Long enough for a reflective pause. */
export const END_OF_TURN_MS = 1600
/** Empty listening sessions in a row before pausing (saves battery; Android beeps on each restart). */
export const MAX_EMPTY_SESSIONS = 4
/** Settle time after Kanha stops speaking, so the tail of the audio isn't picked up. */
const AFTER_SPEECH_MS = 600
/** If a reply finishes but no voice ever plays (voice failed), listen again after this. */
const NO_VOICE_TIMEOUT_MS = 4000

type Recognition = SpeechRecognition

export function recognitionLang(lang: string, navLang: string): string {
  if (lang === 'hi') return 'hi-IN'
  return /-IN$/i.test(navLang) ? navLang : 'en-IN'
}

export function useVoiceConversation({
  lang, loading, onUtterance, onInterrupt, autoStart = true,
}: {
  lang: string
  loading: boolean
  onUtterance: (text: string) => void
  onInterrupt?: () => void
  autoStart?: boolean
}) {
  const [state, setState] = useState<VoiceState>('off')
  const [heard, setHeard] = useState('')

  const activeRef = useRef(autoStart)
  const loadingRef = useRef(loading)
  const speakingRef = useRef(false)
  const awaitingReplyRef = useRef(false)
  const spokeRef = useRef(false)
  const recRef = useRef<Recognition | null>(null)
  const finalRef = useRef('')
  const interimRef = useRef('')
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emptySessions = useRef(0)
  const blockedRef = useRef<VoiceState | null>(null)
  const onUtteranceRef = useRef(onUtterance)
  const onInterruptRef = useRef(onInterrupt)
  const langRef = useRef(lang)
  useLayoutEffect(() => {
    onUtteranceRef.current = onUtterance
    onInterruptRef.current = onInterrupt
    langRef.current = lang
  })

  const clearTimer = (t: React.RefObject<ReturnType<typeof setTimeout> | null>) => {
    if (t.current) { clearTimeout(t.current); t.current = null }
  }

  const stopRecognition = useCallback(() => {
    clearTimer(silenceTimer)
    const r = recRef.current
    recRef.current = null
    if (r) {
      r.onresult = null; r.onend = null; r.onerror = null
      try { r.abort() } catch { /* already stopped */ }
    }
  }, [])

  // The one place that decides what the mic should be doing right now.
  const decideRef = useRef<() => void>(() => {})

  const finishTurn = useCallback(() => {
    const text = `${finalRef.current} ${interimRef.current}`.replace(/\s+/g, ' ').trim()
    stopRecognition()
    finalRef.current = ''
    interimRef.current = ''
    setHeard('')
    if (text) {
      emptySessions.current = 0
      awaitingReplyRef.current = true
      spokeRef.current = false
      setState('thinking')
      onUtteranceRef.current(text)
    } else {
      decideRef.current()
    }
  }, [stopRecognition])

  const startRecognition = useCallback(() => {
    if (recRef.current) return
    const SR = typeof window === 'undefined' ? undefined : (window.SpeechRecognition ?? window.webkitSpeechRecognition)
    if (!SR) { blockedRef.current = 'unsupported'; setState('unsupported'); return }
    const r = new SR()
    r.continuous = true
    r.interimResults = true
    r.lang = recognitionLang(langRef.current, typeof navigator !== 'undefined' ? navigator.language : '')
    finalRef.current = ''
    interimRef.current = ''
    r.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalRef.current += ` ${e.results[i][0].transcript}`
        else interim += e.results[i][0].transcript
      }
      interimRef.current = interim
      setHeard(`${finalRef.current} ${interim}`.replace(/\s+/g, ' ').trim())
      clearTimer(silenceTimer)
      silenceTimer.current = setTimeout(finishTurn, END_OF_TURN_MS)
    }
    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        blockedRef.current = 'denied'
        activeRef.current = false
        stopRecognition()
        setState('denied')
      }
      // no-speech / network / aborted: onend follows and handles it.
    }
    r.onend = () => {
      if (recRef.current !== r) return
      recRef.current = null
      // The browser ended the session (Android does after a short silence).
      if (`${finalRef.current}${interimRef.current}`.trim()) { finishTurn(); return }
      emptySessions.current += 1
      if (emptySessions.current >= MAX_EMPTY_SESSIONS) {
        activeRef.current = false
        setState('off')
        return
      }
      settleTimer.current = setTimeout(() => decideRef.current(), 250)
    }
    recRef.current = r
    try {
      r.start()
      setState('listening')
    } catch {
      recRef.current = null
      activeRef.current = false
      setState('off')
    }
  }, [finishTurn, stopRecognition])

  const decide = useCallback(() => {
    clearTimer(settleTimer)
    if (blockedRef.current) { stopRecognition(); setState(blockedRef.current); return }
    if (!activeRef.current) { stopRecognition(); setState('off'); return }
    if (speakingRef.current) { stopRecognition(); setState('speaking'); return }
    if (loadingRef.current || awaitingReplyRef.current) { stopRecognition(); setState('thinking'); return }
    startRecognition()
  }, [startRecognition, stopRecognition])
  useLayoutEffect(() => { decideRef.current = decide }, [decide])

  // Kanha's voice starting and stopping (announced by useTTS).
  useEffect(() => {
    const onSpeaking = (e: Event) => {
      const on = Boolean((e as CustomEvent).detail)
      speakingRef.current = on
      if (on) {
        spokeRef.current = true
        decideRef.current()
        return
      }
      if (spokeRef.current) awaitingReplyRef.current = false
      clearTimer(settleTimer)
      settleTimer.current = setTimeout(() => decideRef.current(), AFTER_SPEECH_MS)
    }
    window.addEventListener('kanha:speaking', onSpeaking)
    return () => window.removeEventListener('kanha:speaking', onSpeaking)
  }, [])

  // The reply being written.
  useEffect(() => {
    loadingRef.current = loading
    if (loading) { decideRef.current(); return }
    // Reply written. Its last sentences may still be on their way to the voice, so keep the
    // mic closed until the voice has played and finished; if no voice comes (voice off or
    // failed), listen again after a few seconds rather than waiting forever.
    if (!speakingRef.current && (awaitingReplyRef.current || spokeRef.current)) {
      awaitingReplyRef.current = true
      spokeRef.current = false
      clearTimer(settleTimer)
      settleTimer.current = setTimeout(() => {
        if (!spokeRef.current) awaitingReplyRef.current = false
        decideRef.current()
      }, NO_VOICE_TIMEOUT_MS)
    }
  }, [loading])

  // Start (or not) on open; always release the mic on close.
  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) blockedRef.current = 'unsupported'
    const t = setTimeout(() => decideRef.current(), 0)
    return () => {
      clearTimeout(t)
      clearTimer(settleTimer)
      stopRecognition()
    }
  }, [stopRecognition])

  /** The orb: interrupt Kanha, send what you've said, pause, or start listening. */
  const tap = useCallback(() => {
    if (blockedRef.current) return
    if (speakingRef.current) {
      awaitingReplyRef.current = false
      activeRef.current = true
      emptySessions.current = 0
      onInterruptRef.current?.()
      speakingRef.current = false
      decideRef.current()
      return
    }
    if (recRef.current) {
      if (`${finalRef.current}${interimRef.current}`.trim()) finishTurn()
      else { activeRef.current = false; decideRef.current() }
      return
    }
    if (loadingRef.current || awaitingReplyRef.current) return
    activeRef.current = true
    emptySessions.current = 0
    decideRef.current()
  }, [finishTurn])

  /** Pause or resume listening without sending (e.g. while typing instead). */
  const setActive = useCallback((on: boolean) => {
    activeRef.current = on
    if (on) emptySessions.current = 0
    decideRef.current()
  }, [])

  return { state, heard, tap, setActive }
}
