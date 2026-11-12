'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

import { MASTER_LEVEL, Score } from '@/lib/ambient/score'

// Ambient background music: a generative score in the spirit of the old Doordarshan epics
// (strings, a soft tanpura, now and then a bansuri or sitar phrase; see lib/ambient/score.ts).
// Synthesised in the browser with WebAudio: no audio files, no licences. Starts only after a
// user gesture (browser autoplay rules); the choice is remembered on this device.

const KEY = 'kanha.ambient'
const VOLUME = MASTER_LEVEL
const LOOKAHEAD = 6 // seconds scheduled ahead, so a busy or backgrounded tab doesn't leave gaps

type Engine = { ctx: AudioContext; master: GainNode; timer: ReturnType<typeof setInterval> }

function startEngine(): Engine | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  const ctx = new AC()
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)
  const score = new Score(ctx, master)
  const schedule = () => score.scheduleUntil(ctx.currentTime + LOOKAHEAD)
  schedule()
  const timer = setInterval(schedule, 1000)
  master.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 4)
  return { ctx, master, timer }
}

function stopEngine(e: Engine) {
  const t = e.ctx.currentTime
  e.master.gain.cancelScheduledValues(t)
  e.master.gain.setValueAtTime(e.master.gain.value, t)
  e.master.gain.linearRampToValueAtTime(0, t + 1.2)
  clearInterval(e.timer)
  setTimeout(() => { e.ctx.close().catch(() => {}) }, 1400)
}

export function useAmbient() {
  const [on, setOn] = useState(false)
  const engine = useRef<Engine | null>(null)

  const start = useCallback(() => {
    if (engine.current) return
    engine.current = startEngine()
    setOn(Boolean(engine.current))
  }, [])

  const stop = useCallback(() => {
    if (engine.current) stopEngine(engine.current)
    engine.current = null
    setOn(false)
  }, [])

  const toggle = useCallback(() => {
    const next = !engine.current
    if (next) start()
    else stop()
    try { window.localStorage.setItem(KEY, next ? 'on' : 'off') } catch { /* storage blocked */ }
  }, [start, stop])

  /** Quieter while Kanha is speaking. */
  const duck = useCallback((ducked: boolean) => {
    const e = engine.current
    if (!e) return
    const t = e.ctx.currentTime
    e.master.gain.cancelScheduledValues(t)
    e.master.gain.setValueAtTime(e.master.gain.value, t)
    e.master.gain.linearRampToValueAtTime(ducked ? VOLUME * 0.35 : VOLUME, t + 0.6)
  }, [])

  useEffect(() => {
    // Resume a saved "on" at the first tap or key press (browsers block audio before that).
    let saved = false
    try { saved = window.localStorage.getItem(KEY) === 'on' } catch { /* storage blocked */ }
    const resume = () => { if (saved && !engine.current) start() }
    const onSpeaking = (e: Event) => duck(Boolean((e as CustomEvent).detail))
    window.addEventListener('kanha:speaking', onSpeaking)
    if (saved) {
      window.addEventListener('pointerdown', resume, { once: true })
      window.addEventListener('keydown', resume, { once: true })
    }
    return () => {
      window.removeEventListener('kanha:speaking', onSpeaking)
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
      if (engine.current) stopEngine(engine.current)
      engine.current = null
    }
  }, [start, duck])

  return { on, toggle, duck }
}
