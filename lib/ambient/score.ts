// A generative background score in the spirit of the old Doordarshan epics: warm string
// chords that swell and fade, a soft tanpura far behind them, and now and then a bansuri or
// sitar phrase, all in a long hall. No beat and no loop: it never repeats and never pulses.
//
// Everything is synthesised with WebAudio (no audio files, no licences). The same code runs
// live (AudioContext, scheduled a few seconds ahead) and offline (OfflineAudioContext, to
// render a preview file). All randomness comes from `rand`, so a seeded render is repeatable.

export type Rand = () => number

/** Sa = D3. D is a common key for these scores and sits well under a speaking voice. */
export const SA = 146.83

// Just-intonation ratios: they lock with the drone instead of beating against it.
const R = { S: 1, R: 9 / 8, G: 5 / 4, M: 4 / 3, P: 3 / 2, D: 5 / 3, N: 15 / 8 } as const

/** Bhupali (S R G P D): every note sits well over every chord below, so phrases can't clash. */
const PENTA = [R.S, R.R, R.G, R.P, R.D]

/** Chords as frequencies around Sa: bass, then the voicing (I, vi, IV, V in D). */
const CHORDS: Record<string, number[]> = {
  I: [SA / 2, SA, SA * R.P, SA * 2, SA * 2 * R.G],
  vi: [SA * R.D / 2, SA, SA * R.G, SA * R.D, SA * 2],
  IV: [SA * R.M / 2, SA, SA * R.M, SA * R.D, SA * 2],
  V: [SA * R.P / 2, SA * R.R, SA * R.P, SA * R.N, SA * 2 * R.R],
}
const NEXT: Record<string, string[]> = { I: ['IV', 'vi', 'IV', 'V'], IV: ['I', 'I', 'V'], vi: ['IV'], V: ['I'] }

export function seeded(seed: number): Rand {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (rand: Rand, a: number, b: number) => a + rand() * (b - a)
const pick = <T,>(rand: Rand, xs: T[]) => xs[Math.floor(rand() * xs.length)]

function hallImpulse(ctx: BaseAudioContext, rand: Rand, seconds = 5.5): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const x = i / len
      // Darker as it decays, like a real hall: a one-pole lowpass that closes over time.
      const a = 0.55 + 0.4 * x
      lp = lp * a + (rand() * 2 - 1) * (1 - a)
      d[i] = lp * Math.pow(1 - x, 2.4) * 1.6
    }
  }
  return buf
}

/** A plucked string (Karplus–Strong), rendered once into a buffer and replayed at any pitch. */
function pluckedString(ctx: BaseAudioContext, rand: Rand, f0: number, seconds: number, decay: number, bright: number): { buffer: AudioBuffer; f: number } {
  const sr = ctx.sampleRate
  const n = Math.max(2, Math.round(sr / f0))
  const len = Math.floor(sr * seconds)
  const buf = ctx.createBuffer(1, len, sr)
  const y = buf.getChannelData(0)
  // Excitation: noise, softened (a plectrum, not a click).
  let prev = 0
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1
    prev = prev + (w - prev) * bright
    y[i] = prev
  }
  for (let i = n; i < len; i++) {
    const v = decay * 0.5 * (y[i - n] + y[i - n - 1 < 0 ? 0 : i - n - 1])
    // A touch of the sitar's buzzing bridge (jawari): soft asymmetric saturation.
    y[i] = v > 0.25 ? 0.25 + (v - 0.25) * 0.6 : v
  }
  let peak = 0
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]))
  if (peak > 0) for (let i = 0; i < len; i++) y[i] /= peak
  // The loop length sets the pitch: n samples + half a sample from the averaging filter.
  return { buffer: buf, f: sr / (n + 0.5) }
}

function noiseBuffer(ctx: BaseAudioContext, rand: Rand, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = rand() * 2 - 1
  return buf
}

function softTanpuraWave(ctx: BaseAudioContext): PeriodicWave {
  const n = 16
  const real = new Float32Array(n)
  const imag = new Float32Array(n)
  for (let k = 1; k < n; k++) imag[k] = 1 / Math.pow(k, 1.5)
  return ctx.createPeriodicWave(real, imag)
}

type Bus = { input: GainNode }

export class Score {
  private ctx: BaseAudioContext
  private rand: Rand
  private strings: Bus
  private drone: Bus
  private lead: Bus
  private sitar: { buffer: AudioBuffer; f: number }
  private noise: AudioBuffer
  private wave: PeriodicWave
  private chord = 'I'
  private nextChord: number
  private nextDrone: number
  private droneIdx = 0
  private nextLead: number

  constructor(ctx: BaseAudioContext, out: AudioNode, rand: Rand = Math.random, start = ctx.currentTime) {
    this.ctx = ctx
    this.rand = rand
    // Keep the low end clean: a gentle high-pass on everything, a firmer one into the hall
    // (a reverberant bass is what turns a pad into mud).
    const clean = ctx.createBiquadFilter()
    clean.type = 'highpass'
    clean.frequency.value = 65
    clean.Q.value = 0.6
    clean.connect(out)
    const hall = ctx.createConvolver()
    hall.buffer = hallImpulse(ctx, rand)
    const pre = ctx.createDelay(0.2)
    pre.delayTime.value = 0.045
    const hallLow = ctx.createBiquadFilter()
    hallLow.type = 'highpass'
    hallLow.frequency.value = 220
    pre.connect(hallLow)
    hallLow.connect(hall)
    hall.connect(clean)
    // Each layer: a dry share and a send into the hall.
    const bus = (dry: number, wet: number): Bus => {
      const input = ctx.createGain()
      const d = ctx.createGain(); d.gain.value = dry
      const w = ctx.createGain(); w.gain.value = wet
      input.connect(d); d.connect(clean)
      input.connect(w); w.connect(pre)
      return { input }
    }
    this.strings = bus(0.75, 0.55)
    this.drone = bus(0.35, 0.7)
    this.lead = bus(0.6, 0.65)
    this.sitar = pluckedString(ctx, rand, SA * 2, 4, 0.9985, 0.35)
    this.noise = noiseBuffer(ctx, rand)
    this.wave = softTanpuraWave(ctx)
    this.nextChord = start + 0.05
    this.nextDrone = start + 1.5
    // Let the strings and drone settle in before any melody.
    this.nextLead = start + between(rand, 9, 13)
  }

  /** Schedule everything that starts before `until` (seconds on the context clock). */
  scheduleUntil(until: number) {
    while (this.nextChord < until) this.nextChord = this.playChord(this.nextChord)
    while (this.nextDrone < until) this.nextDrone = this.playDrone(this.nextDrone)
    while (this.nextLead < until) this.nextLead = this.playLead(this.nextLead)
  }

  // ── Strings: slow swells, each chord fading into the next ─────────────────────
  private playChord(t: number): number {
    const ctx = this.ctx
    const len = between(this.rand, 10, 14)
    const attack = 3.8, release = 6
    const end = t + len + release
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.4
    // The filter opens with the swell and closes as it fades: the "bowed" breath of a section.
    filter.frequency.setValueAtTime(380, t)
    filter.frequency.linearRampToValueAtTime(between(this.rand, 1100, 1500), t + attack + 1.5)
    filter.frequency.linearRampToValueAtTime(500, end)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1, t + attack)
    g.gain.setValueAtTime(1, t + len)
    g.gain.linearRampToValueAtTime(0, end)
    filter.connect(g)
    g.connect(this.strings.input)
    const notes = CHORDS[this.chord]
    notes.forEach((f, i) => {
      const level = i === 0 ? 0.03 : 0.03
      // Three players per part, slightly out of tune with each other: an ensemble, not a synth.
      for (const cents of [-7, 0, 6]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = cents + between(this.rand, -2, 2)
        const v = ctx.createGain()
        v.gain.value = level
        o.connect(v)
        v.connect(filter)
        o.start(t)
        o.stop(end + 0.1)
      }
    })
    this.chord = pick(this.rand, NEXT[this.chord])
    // The next chord starts while this one is still sounding.
    return t + len
  }

  // ── Tanpura: soft, unhurried, never on a grid ─────────────────────────────────
  private playDrone(t: number): number {
    const ctx = this.ctx
    // Pa, Sa, Sa, then Sa an octave down: the tanpura's cycle, voiced high enough not to thump.
    const cycle = [SA * R.P, SA * 2, SA * 2, SA]
    const f = cycle[this.droneIdx++ % cycle.length]
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.026, t + 0.22)
    g.gain.exponentialRampToValueAtTime(0.0005, t + 7)
    const lp = ctx.createBiquadFilter()
    lp.type = 'bandpass'
    lp.frequency.value = 700
    lp.Q.value = 0.35
    g.connect(lp)
    lp.connect(this.drone.input)
    for (const cents of [-2, 2]) {
      const o = ctx.createOscillator()
      o.setPeriodicWave(this.wave)
      o.frequency.value = f
      o.detune.value = cents
      o.connect(g)
      o.start(t)
      o.stop(t + 7.1)
    }
    return t + between(this.rand, 1.7, 2.6)
  }

  // ── Melody: a bansuri or a sitar phrase, then a long silence ──────────────────
  private playLead(t: number): number {
    const end = this.rand() < 0.58 ? this.bansuri(t) : this.sitarPhrase(t)
    return end + between(this.rand, 7, 15)
  }

  private phrase(count: number, lowOctave: number): number[] {
    // A gentle random walk on the pentatonic scale, ending on a resting note (Sa, Ga or Pa).
    const scale: number[] = []
    for (let oct = 0; oct < 2; oct++) for (const r of PENTA) scale.push(SA * lowOctave * r * 2 ** oct)
    scale.push(SA * lowOctave * 4)
    let i = 2 + Math.floor(this.rand() * 5)
    const out: number[] = []
    for (let k = 0; k < count; k++) {
      out.push(scale[i])
      const step = pick(this.rand, [-2, -1, -1, 1, 1, 2])
      i = Math.min(scale.length - 1, Math.max(0, i + step))
    }
    const rests = scale.map((f, j) => ({ f, j })).filter(({ j }) => j % 5 === 0 || j % 5 === 2 || j % 5 === 3)
    const last = out[out.length - 1]
    out[out.length - 1] = rests.reduce((a, b) => (Math.abs(b.f - last) < Math.abs(a.f - last) ? b : a)).f
    return out
  }

  private bansuri(t: number): number {
    const ctx = this.ctx
    const notes = this.phrase(3 + Math.floor(this.rand() * 4), 2)
    const durs = notes.map((_, k) => (k === notes.length - 1 ? between(this.rand, 2.6, 4) : between(this.rand, 0.55, 1.5)))
    const total = durs.reduce((a, b) => a + b, 0)
    const end = t + total + 1.2

    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0, t)
    amp.gain.linearRampToValueAtTime(0.1, t + 0.25)
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2400
    amp.connect(tone)
    tone.connect(this.lead.input)

    // One breath through the whole phrase: the pitch glides from note to note (meend).
    const vib = ctx.createOscillator()
    vib.frequency.value = between(this.rand, 4.6, 5.4)
    const vibDepth = ctx.createGain()
    vibDepth.gain.setValueAtTime(0, t)
    vib.connect(vibDepth)
    const parts: [number, number][] = [[1, 1], [2, 0.14], [3, 0.04]]
    const oscs = parts.map(([h, level]) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(notes[0] * h, t)
      vibDepth.connect(o.detune)
      const v = ctx.createGain()
      v.gain.value = level
      o.connect(v)
      v.connect(amp)
      return { o, h }
    })
    // Breath: a little filtered noise that follows the tone, stronger at the start of a note.
    const breath = ctx.createBufferSource()
    breath.buffer = this.noise
    breath.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = notes[0] * 2
    bp.Q.value = 1.2
    const bg = ctx.createGain()
    bg.gain.setValueAtTime(0, t)
    breath.connect(bp); bp.connect(bg); bg.connect(amp)

    let at = t
    notes.forEach((f, k) => {
      const d = durs[k]
      if (k > 0) {
        for (const { o, h } of oscs) o.frequency.setTargetAtTime(f * h, at, 0.045)
        bp.frequency.setTargetAtTime(f * 2, at, 0.05)
        // A soft tongue: the tone dips a little between notes.
        amp.gain.setTargetAtTime(0.066, at - 0.06, 0.03)
        amp.gain.setTargetAtTime(0.1, at + 0.05, 0.06)
      }
      bg.gain.setTargetAtTime(0.5, at, 0.02)
      bg.gain.setTargetAtTime(0.18, at + 0.12, 0.15)
      // Vibrato blooms only on the longer notes.
      vibDepth.gain.setTargetAtTime(0, at, 0.05)
      if (d > 1) vibDepth.gain.setTargetAtTime(14, at + 0.45, 0.35)
      at += d
    })
    amp.gain.setTargetAtTime(0, at - 0.4, 0.35)
    bg.gain.setTargetAtTime(0, at - 0.4, 0.3)
    for (const { o } of oscs) { o.start(t); o.stop(end) }
    vib.start(t); vib.stop(end)
    breath.start(t); breath.stop(end)
    return t + total
  }

  private sitarPhrase(t: number): number {
    const ctx = this.ctx
    const notes = this.phrase(3 + Math.floor(this.rand() * 3), 1)
    let at = t
    notes.forEach((f, k) => {
      const lastNote = k === notes.length - 1
      const src = ctx.createBufferSource()
      src.buffer = this.sitar.buffer
      const rate = f / this.sitar.f
      src.playbackRate.setValueAtTime(rate, at)
      if (lastNote && this.rand() < 0.7) {
        // Meend: pull the last string up a step and let it fall back.
        const up = rate * (this.rand() < 0.5 ? R.R : 16 / 15)
        src.playbackRate.setValueAtTime(rate, at + 0.35)
        src.playbackRate.linearRampToValueAtTime(up, at + 0.75)
        src.playbackRate.setValueAtTime(up, at + 1.2)
        src.playbackRate.linearRampToValueAtTime(rate, at + 1.7)
      }
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.12, at)
      // Fade before the source stops: low notes play the buffer slowly and still ring at 4 s.
      g.gain.setTargetAtTime(0, at + 3, 0.22)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 3200
      src.connect(lp); lp.connect(g); g.connect(this.lead.input)
      src.start(at)
      src.stop(at + 4)
      at += lastNote ? 0 : between(this.rand, 0.45, 0.95)
    })
    return at + 3
  }
}

/** Renders `seconds` of the score offline (for previews and tests of loudness). */
export async function renderScore(seconds: number, seed = 1, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.floor(seconds * sampleRate), sampleRate)
  const master = ctx.createGain()
  master.gain.value = MASTER_LEVEL
  master.connect(ctx.destination)
  const score = new Score(ctx, master, seeded(seed), 0)
  score.scheduleUntil(seconds)
  return ctx.startRendering()
}

/** Overall level of the score at full volume (before ducking under speech). */
export const MASTER_LEVEL = 0.55
