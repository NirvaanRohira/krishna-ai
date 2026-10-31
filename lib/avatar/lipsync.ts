// Audio-driven lip-sync: turns an FFT frame of the TTS audio into mouth-shape weights.
//
// Runs entirely in the browser off a WebAudio AnalyserNode — zero server cost and
// provider-agnostic (Polly / Google / Sarvam / anything that returns audio). It is the
// same family of technique VTuber rigs use: overall speech energy drives jaw opening,
// and where that energy sits in the spectrum (vowel formants) picks the mouth shape.
//
//   low band  (~150–700 Hz,  F1-heavy)  → rounded "oh" / "ou"
//   mid band  (~700–1800 Hz)            → open "aa"
//   high band (~1800–4000 Hz, high F2)  → spread "ee" / "ih"

export type Viseme = 'aa' | 'oh' | 'ou' | 'ee' | 'ih'
export type VisemeWeights = Record<Viseme, number>

export const ZERO_VISEMES: VisemeWeights = { aa: 0, oh: 0, ou: 0, ee: 0, ih: 0 }

export type Bands = { volume: number; low: number; mid: number; high: number }

function bandAverage(freq: ArrayLike<number>, binHz: number, fromHz: number, toHz: number): number {
  const start = Math.max(0, Math.floor(fromHz / binHz))
  const end = Math.min(freq.length - 1, Math.ceil(toHz / binHz))
  if (end < start) return 0
  let sum = 0
  for (let i = start; i <= end; i++) sum += freq[i]
  return sum / (end - start + 1) / 255
}

/** Reduce a byte-frequency frame (AnalyserNode.getByteFrequencyData) to speech bands, each 0..1. */
export function analyseSpectrum(freq: ArrayLike<number>, sampleRate: number, fftSize: number): Bands {
  const binHz = sampleRate / fftSize
  const low = bandAverage(freq, binHz, 150, 700)
  const mid = bandAverage(freq, binHz, 700, 1800)
  const high = bandAverage(freq, binHz, 1800, 4000)
  const volume = low * 0.45 + mid * 0.4 + high * 0.15
  return { volume, low, mid, high }
}

/**
 * Map speech bands to viseme weights. `gate` is the volume below which the mouth stays
 * closed (silence / breath noise); `gain` boosts quiet TTS so the jaw still moves.
 */
export function bandsToVisemes(b: Bands, opts: { gate?: number; gain?: number } = {}): VisemeWeights {
  const gate = opts.gate ?? 0.06
  const gain = opts.gain ?? 2.4
  if (b.volume <= gate) return { ...ZERO_VISEMES }

  const open = Math.min(1, (b.volume - gate) * gain)
  const total = b.low + b.mid + b.high || 1
  const lowR = b.low / total
  const midR = b.mid / total
  const highR = b.high / total

  // Spectral shape → which mouth shape dominates. Ratios are ~0.33 each for flat noise,
  // so subtract a baseline to make the dominant band stand out.
  const rounded = Math.max(0, lowR - 0.4) * 2.5
  const spread = Math.max(0, highR - 0.15) * 3
  const openShape = Math.max(0.35, midR + 0.2)

  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  return {
    aa: clamp(open * openShape),
    oh: clamp(open * rounded * 0.9),
    ou: clamp(open * rounded * 0.5),
    ee: clamp(open * spread * 0.8),
    ih: clamp(open * spread * 0.5),
  }
}

/** Attack/release smoothing so the mouth doesn't jitter frame to frame. */
export function smoothVisemes(
  prev: VisemeWeights,
  next: VisemeWeights,
  dtSec: number,
  attack = 28,
  release = 14
): VisemeWeights {
  const out = { ...prev }
  for (const k of Object.keys(next) as Viseme[]) {
    const rate = next[k] > prev[k] ? attack : release
    const t = 1 - Math.exp(-rate * dtSec)
    out[k] = prev[k] + (next[k] - prev[k]) * t
  }
  return out
}

// Morph-target names each canonical shape will drive, covering the common rig standards:
// Oculus/Meta visemes (viseme_*), ARKit 52 blendshapes, VRM expressions, VRoid Studio
// shape keys (Fcl_*), and plain names.
// The artist only needs ONE of these conventions in the exported GLB.
export const MORPH_TARGETS: Record<Viseme | 'blink' | 'smile', string[]> = {
  aa: ['viseme_aa', 'jawOpen', 'mouthOpen', 'aa', 'A', 'Fcl_MTH_A'],
  oh: ['viseme_O', 'mouthFunnel', 'oh', 'O', 'Fcl_MTH_O'],
  ou: ['viseme_U', 'mouthPucker', 'ou', 'U', 'Fcl_MTH_U'],
  ee: ['viseme_E', 'mouthStretchLeft', 'mouthStretchRight', 'ee', 'E', 'Fcl_MTH_E'],
  ih: ['viseme_I', 'ih', 'I', 'Fcl_MTH_I'],
  blink: ['eyeBlinkLeft', 'eyeBlinkRight', 'eyesClosed', 'blink', 'Blink', 'Fcl_EYE_Close'],
  smile: ['mouthSmileLeft', 'mouthSmileRight', 'mouthSmile', 'happy', 'Smile', 'Fcl_MTH_Fun'],
}

/** Resolve which morph indices on a mesh correspond to each shape (done once at load). */
export function resolveMorphIndices(
  dict: Record<string, number> | undefined
): Partial<Record<keyof typeof MORPH_TARGETS, number[]>> {
  if (!dict) return {}
  const out: Partial<Record<keyof typeof MORPH_TARGETS, number[]>> = {}
  for (const [shape, names] of Object.entries(MORPH_TARGETS) as [keyof typeof MORPH_TARGETS, string[]][]) {
    const idx = names.map((n) => dict[n]).filter((i): i is number => typeof i === 'number')
    if (idx.length) out[shape] = idx
  }
  return out
}
