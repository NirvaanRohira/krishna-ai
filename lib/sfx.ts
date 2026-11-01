'use client'
// A soft paper rustle for each page that turns, synthesised (filtered noise), no files.
// Plays only if the person has sound on (ambient tanpura enabled on this device).

let ctx: AudioContext | null = null

function soundOn(): boolean {
  try { return window.localStorage.getItem('kanha.ambient') === 'on' } catch { return false }
}

export function pageRustles(times: number[]): void {
  if (typeof window === 'undefined' || !soundOn()) return
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx ??= new AC()
  const c = ctx
  const len = Math.floor(c.sampleRate * 0.35)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.8)
  for (const t of times) {
    const src = c.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = 0.85 + Math.random() * 0.3
    const band = c.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 2200 + Math.random() * 1600
    band.Q.value = 0.7
    const g = c.createGain()
    g.gain.value = 0.05
    src.connect(band)
    band.connect(g)
    g.connect(c.destination)
    src.start(c.currentTime + t)
  }
}
