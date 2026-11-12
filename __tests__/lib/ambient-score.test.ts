import { describe, it, expect } from 'vitest'
import { Score, seeded } from '@/lib/ambient/score'

// A stand-in for an AudioContext that records when sources start. Every AudioParam method is
// accepted and ignored; we only care about the timing of events.
function fakeContext() {
  const starts: { kind: string; at: number; freq?: number; wave?: string }[] = []
  const param = () => {
    const p: Record<string, unknown> = { value: 0 }
    for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues'])
      p[m] = () => p
    return p
  }
  const node = (kind: string) => {
    const n: Record<string, unknown> = {
      connect: () => {}, disconnect: () => {},
      gain: param(), frequency: param(), detune: param(), Q: param(), delayTime: param(), playbackRate: param(),
      buffer: null, type: '', loop: false,
      stop: () => {},
    }
    n.setPeriodicWave = () => { n.type = 'custom' }
    n.start = (at = 0) => starts.push({ kind, at, freq: (n.frequency as { value: number }).value, wave: n.type as string })
    return n
  }
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    createGain: () => node('gain'),
    createBiquadFilter: () => node('filter'),
    createConvolver: () => node('convolver'),
    createDelay: () => node('delay'),
    createOscillator: () => node('osc'),
    createBufferSource: () => node('buffer'),
    createPeriodicWave: () => ({}),
    createBuffer: (ch: number, len: number) => {
      const data = Array.from({ length: ch }, () => new Float32Array(len))
      return { getChannelData: (i: number) => data[i] }
    },
  }
  return { ctx: ctx as unknown as BaseAudioContext, starts }
}

describe('ambient score', () => {
  it('has no beat: drone plucks come at irregular intervals, chords change slowly', () => {
    const { ctx, starts } = fakeContext()
    new Score(ctx, ctx.createGain(), seeded(3), 0).scheduleUntil(120)
    // Drone plucks: the tanpura-timbre oscillators (a custom wave), started in pairs.
    const droneTimes = [...new Set(starts.filter((s) => s.wave === 'custom').map((s) => s.at))].sort((a, b) => a - b)
    const gaps = droneTimes.slice(1).map((t, i) => t - droneTimes[i])
    expect(gaps.length).toBeGreaterThan(30)
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1.7)
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.5) // not on a grid
    // Chords: the sawtooth string players start together, at least 10 s apart.
    const chordTimes = [...new Set(starts.filter((s) => s.wave === 'sawtooth').map((s) => s.at))].sort((a, b) => a - b)
    const chordGaps = chordTimes.slice(1).map((t, i) => t - chordTimes[i])
    expect(Math.min(...chordGaps)).toBeGreaterThanOrEqual(10)
  })

  it('lets the strings settle before the first melody', () => {
    const { ctx, starts } = fakeContext()
    new Score(ctx, ctx.createGain(), seeded(9), 0).scheduleUntil(180)
    const sitar = starts.filter((s) => s.kind === 'buffer' && s.at > 0)
    const flute = starts.filter((s) => s.wave === 'sine')
    const firstLead = Math.min(...[...sitar, ...flute].map((s) => s.at))
    expect(firstLead).toBeGreaterThanOrEqual(9)
    expect(sitar.length + flute.length).toBeGreaterThan(0)
  })

  it('is repeatable with a seed (for previews)', () => {
    const a = fakeContext(), b = fakeContext()
    new Score(a.ctx, a.ctx.createGain(), seeded(5), 0).scheduleUntil(60)
    new Score(b.ctx, b.ctx.createGain(), seeded(5), 0).scheduleUntil(60)
    expect(a.starts).toEqual(b.starts)
  })
})
