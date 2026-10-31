import { describe, it, expect } from 'vitest'
import {
  analyseSpectrum, bandsToVisemes, smoothVisemes, resolveMorphIndices, ZERO_VISEMES,
} from '@/lib/avatar/lipsync'

const SAMPLE_RATE = 48000
const FFT = 1024 // 512 bins, ~46.9 Hz each

function frameWithEnergy(fromHz: number, toHz: number, level = 220): Uint8Array {
  const f = new Uint8Array(FFT / 2)
  const bin = SAMPLE_RATE / FFT
  for (let i = Math.floor(fromHz / bin); i <= Math.ceil(toHz / bin); i++) f[i] = level
  return f
}

describe('analyseSpectrum', () => {
  it('returns zero volume for silence', () => {
    expect(analyseSpectrum(new Uint8Array(512), SAMPLE_RATE, FFT).volume).toBe(0)
  })

  it('attributes energy to the right band', () => {
    const low = analyseSpectrum(frameWithEnergy(150, 700), SAMPLE_RATE, FFT)
    expect(low.low).toBeGreaterThan(low.high)
    const high = analyseSpectrum(frameWithEnergy(1800, 4000), SAMPLE_RATE, FFT)
    expect(high.high).toBeGreaterThan(high.low)
  })
})

describe('bandsToVisemes', () => {
  it('keeps the mouth closed below the noise gate', () => {
    expect(bandsToVisemes({ volume: 0.02, low: 0.02, mid: 0.02, high: 0.02 })).toEqual(ZERO_VISEMES)
  })

  it('opens the jaw ("aa") for loud, mid-heavy speech', () => {
    const v = bandsToVisemes({ volume: 0.5, low: 0.3, mid: 0.7, high: 0.2 })
    expect(v.aa).toBeGreaterThan(0.5)
  })

  it('rounds the lips for low-formant vowels and spreads them for high-formant vowels', () => {
    const round = bandsToVisemes({ volume: 0.5, low: 0.9, mid: 0.2, high: 0.05 })
    const spread = bandsToVisemes({ volume: 0.5, low: 0.1, mid: 0.3, high: 0.8 })
    expect(round.oh).toBeGreaterThan(round.ee)
    expect(spread.ee).toBeGreaterThan(spread.oh)
  })

  it('keeps all weights in 0..1', () => {
    const v = bandsToVisemes({ volume: 5, low: 5, mid: 5, high: 5 })
    for (const w of Object.values(v)) { expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThanOrEqual(1) }
  })
})

describe('smoothVisemes', () => {
  it('moves toward the target without overshooting', () => {
    const next = { ...ZERO_VISEMES, aa: 1 }
    const s = smoothVisemes(ZERO_VISEMES, next, 1 / 60)
    expect(s.aa).toBeGreaterThan(0)
    expect(s.aa).toBeLessThan(1)
  })

  it('opens faster than it closes (attack > release)', () => {
    const opened = smoothVisemes(ZERO_VISEMES, { ...ZERO_VISEMES, aa: 1 }, 1 / 60).aa
    const closed = 1 - smoothVisemes({ ...ZERO_VISEMES, aa: 1 }, ZERO_VISEMES, 1 / 60).aa
    expect(opened).toBeGreaterThan(closed)
  })
})

describe('resolveMorphIndices', () => {
  it('maps Oculus visemes, ARKit and VRM-style names', () => {
    const idx = resolveMorphIndices({ viseme_aa: 0, jawOpen: 1, eyeBlinkLeft: 2, eyeBlinkRight: 3, ou: 4 })
    expect(idx.aa).toEqual([0, 1])
    expect(idx.blink).toEqual([2, 3])
    expect(idx.ou).toEqual([4])
    expect(idx.ee).toBeUndefined()
  })

  it('handles meshes without morph targets', () => {
    expect(resolveMorphIndices(undefined)).toEqual({})
  })
})
