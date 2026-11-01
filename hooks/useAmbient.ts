'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

// An ambient tanpura drone, synthesised in the browser with WebAudio: no audio files, no
// licences, a few KB of code. Four plucks (Pa below, Sa, Sa, low Sa) cycle every ~5 s
// through a soft reverb, over a quiet sustained Sa. Starts only after a user gesture
// (browser autoplay rules); the choice is remembered on this device.

const KEY = 'kanha.ambient'
const SA = 138.6 // C#3: a common male tanpura tuning
const CYCLE = [SA * 0.75, SA, SA, SA / 2] // Pa (below), Sa, Sa, low Sa
const STEP = 1.25 // seconds between plucks
const VOLUME = 0.14

function impulse(ctx: AudioContext, seconds = 3.2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
  }
  return buf
}

// Rich, buzzy harmonic spectrum (the tanpura's jawari bridge makes upper partials ring).
function tanpuraWave(ctx: AudioContext): PeriodicWave {
  const n = 24
  const real = new Float32Array(n)
  const imag = new Float32Array(n)
  for (let k = 1; k < n; k++) imag[k] = (1 / Math.pow(k, 0.85)) * (k % 2 === 0 ? 0.9 : 1)
  return ctx.createPeriodicWave(real, imag)
}

type Engine = { ctx: AudioContext; master: GainNode; timer: ReturnType<typeof setInterval>; drone: OscillatorNode[] }

function startEngine(): Engine | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  const ctx = new AC()
  const master = ctx.createGain()
  master.gain.value = 0
  const reverb = ctx.createConvolver()
  reverb.buffer = impulse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.55
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2600
  tone.connect(master)
  tone.connect(reverb)
  reverb.connect(wet)
  wet.connect(master)
  master.connect(ctx.destination)

  // A barely-there sustained Sa underneath, so silence never feels empty between plucks.
  const droneGain = ctx.createGain()
  droneGain.gain.value = 0.05
  droneGain.connect(tone)
  const drone = [SA / 2, SA / 2 * 1.003].map((f) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    o.connect(droneGain)
    o.start()
    return o
  })

  const wave = tanpuraWave(ctx)
  let next = ctx.currentTime + 0.1
  let idx = 0
  const schedule = () => {
    while (next < ctx.currentTime + 1.5) {
      const f = CYCLE[idx % CYCLE.length]
      for (const detune of [-3, 3]) {
        const o = ctx.createOscillator()
        o.setPeriodicWave(wave)
        o.frequency.value = f
        o.detune.value = detune
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, next)
        g.gain.linearRampToValueAtTime(0.11, next + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0008, next + STEP * 3.4)
        o.connect(g)
        g.connect(tone)
        o.start(next)
        o.stop(next + STEP * 3.5)
      }
      next += STEP
      idx++
    }
  }
  schedule()
  const timer = setInterval(schedule, 300)
  master.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 2.5)
  return { ctx, master, timer, drone }
}

function stopEngine(e: Engine) {
  const t = e.ctx.currentTime
  e.master.gain.cancelScheduledValues(t)
  e.master.gain.setValueAtTime(e.master.gain.value, t)
  e.master.gain.linearRampToValueAtTime(0, t + 1.2)
  clearInterval(e.timer)
  setTimeout(() => { e.drone.forEach((o) => { try { o.stop() } catch { /* already stopped */ } }); e.ctx.close().catch(() => {}) }, 1400)
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
