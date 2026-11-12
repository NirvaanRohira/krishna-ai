'use client'
// Dev-only harness for checking an exported GLB: outfits, framing, blinks and lip-sync,
// without logging in or spending LLM/TTS calls. Drop the models at public/avatar/krishna-<outfit>.glb (see lib/avatar/config.ts)
// and open /avatar-preview. "Test voice" plays a synthetic vowel sweep through the same
// analyser path the real TTS uses. Returns 404 in production builds.

import { useCallback, useRef, useState } from 'react'
import { notFound } from 'next/navigation'
import KrishnaAvatar from '@/components/KrishnaAvatar'
import PaintedAvatar from '@/components/PaintedAvatar'
import AvatarPanel from '@/components/AvatarPanel'
import { OUTFITS, paintedAvatarUrl, rendererFor, type AvatarStyle } from '@/lib/avatar/config'

export default function AvatarPreview() {
  if (process.env.NODE_ENV === 'production') notFound()

  const [outfitId, setOutfitId] = useState('divine')
  const [info, setInfo] = useState('loading…')
  const [style, setStyle] = useState<AvatarStyle>('painted')
  // "Panel" shows the real avatar mode (topbar, outfit sheet, caption, input bar) as it ships.
  const [panel, setPanel] = useState(false)
  const renderer = rendererFor(outfitId, style)
  const painted = paintedAvatarUrl(outfitId)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  const getAnalyser = useCallback(() => analyserRef.current, [])

  function testVoice() {
    const ctx = ctxRef.current ?? new AudioContext()
    ctxRef.current = ctx
    if (!analyserRef.current) {
      const a = ctx.createAnalyser()
      a.fftSize = 1024
      a.smoothingTimeConstant = 0.5
      a.connect(ctx.destination)
      analyserRef.current = a
    }
    // Buzz source → two formant filters, swept through aa / ee / oh / ou, gated into syllables.
    const t0 = ctx.currentTime
    const src = ctx.createOscillator()
    src.type = 'sawtooth'
    src.frequency.value = 120
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 6
    const gain = ctx.createGain(); gain.gain.value = 0
    src.connect(f1).connect(gain); src.connect(f2).connect(gain)
    gain.connect(analyserRef.current!)
    const vowels: [number, number][] = [[750, 1200], [300, 2300], [450, 800], [320, 700], [700, 1100], [350, 2000]]
    for (let i = 0; i < 12; i++) {
      const [a, b] = vowels[i % vowels.length]
      const s = t0 + i * 0.28
      f1.frequency.setValueAtTime(a, s); f2.frequency.setValueAtTime(b, s)
      gain.gain.setValueAtTime(0, s)
      gain.gain.linearRampToValueAtTime(0.5, s + 0.06)
      gain.gain.linearRampToValueAtTime(0, s + 0.24)
    }
    src.start(t0)
    src.stop(t0 + 12 * 0.28 + 0.1)
  }

  if (panel) {
    return (
      <main style={{ position: 'fixed', inset: 0 }}>
        <AvatarPanel
          onClose={() => setPanel(false)}
          onSend={testVoice}
          loading={false}
          caption="When the mind is restless, come back to one small thing you can do with care today."
          getAnalyser={getAnalyser}
        />
      </main>
    )
  }

  return (
    <main style={{ position: 'fixed', inset: 0, background: 'radial-gradient(60% 45% at 50% 38%, var(--stage-glow), transparent 70%), linear-gradient(var(--night-1), var(--night-0))' }}>
      {renderer === 'painted' && painted ? (
        <PaintedAvatar key={painted} url={painted} getAnalyser={getAnalyser} onReady={() => setInfo('painted')} onFail={() => setInfo('painted failed')} />
      ) : (
        <KrishnaAvatar
          getAnalyser={getAnalyser}
          outfitId={outfitId}
          onModelInfo={(i) => setInfo(`${i.mode}${i.outfits.length ? ` · outfits in GLB: ${i.outfits.join(', ')}` : ''}`)}
        />
      )}
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: 'system-ui', fontSize: 13, color: 'var(--ink-2)' }}>
        <button type="button" onClick={testVoice}>Test voice</button>
        <button type="button" onClick={() => setStyle(style === 'painted' ? '3d' : 'painted')}>Style: {style}</button>
        <button type="button" onClick={() => setPanel(true)}>Panel</button>
        {OUTFITS.map((o) => (
          <button type="button" key={o.id} onClick={() => setOutfitId(o.id)} aria-pressed={o.id === outfitId}>
            {o.label}
          </button>
        ))}
        <span data-testid="avatar-info" style={{ alignSelf: 'center' }}>{info}</span>
      </div>
    </main>
  )
}
