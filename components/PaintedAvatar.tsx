'use client'
// The painted avatar: one illustration that breathes, blinks, sways and talks, drawn with
// WebGL by `mesh-avatar` (MIT). The file is a .mavatar archive in /public/avatar/painted
// (~100–370 KB, cached by the browser). Lip-sync follows the loudness of the same TTS audio
// the 3D avatar listens to, so there is no extra network or server cost.
//
// If the player can't start (no WebGL, a bad file), it reports onFail and the panel falls
// back to the 3D model.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { analyseSpectrum } from '@/lib/avatar/lipsync'

type Props = {
  url: string
  getAnalyser: () => AnalyserNode | null
  onFail?: () => void
  onReady?: () => void
}

/** How much of the figure (from the top of the image) fills the stage height: down to about the knees. */
const SHOW = 0.74

export default function PaintedAvatar({ url, getAnalyser, onFail, onReady }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const getAnalyserRef = useRef(getAnalyser)
  const onFailRef = useRef(onFail)
  const onReadyRef = useRef(onReady)
  useLayoutEffect(() => {
    getAnalyserRef.current = getAnalyser
    onFailRef.current = onFail
    onReadyRef.current = onReady
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    let disposed = false
    let raf = 0
    let ro: ResizeObserver | undefined
    let avatar: { destroy(): void } | undefined

    ;(async () => {
      try {
        const { loadMeshAvatar } = await import('mesh-avatar')
        if (disposed) return
        const loaded = await loadMeshAvatar(canvas, url)
        if (disposed) { loaded.destroy(); loaded.package.release(); return }
        avatar = loaded
        const { width: imgW, height: imgH } = loaded.package.rig.image

        // Frame the figure: the top SHOW of the picture fills the stage height, never wider
        // than the stage. The canvas is the whole picture; the stage crops the legs.
        const fit = () => {
          const sw = stage.clientWidth, sh = stage.clientHeight
          let h = sh / SHOW
          let w = h * (imgW / imgH)
          if (w > sw) { w = sw; h = w * (imgH / imgW) }
          canvas.style.width = `${Math.round(w)}px`
          canvas.style.height = `${Math.round(h)}px`
        }
        fit()
        ro = new ResizeObserver(fit)
        ro.observe(stage)

        loaded.setAutoIdle(true)
        // Gentle, not chatty: a smaller mouth, slower to snap open, and less head movement.
        // (The default settings open the painted mouth wide enough to show teeth.)
        loaded.setLipSync({ openness: 0.1, granularity: 0.3, closeSpeed: 0.6 })
        loaded.setTalkGain(0.45)
        setReady(true)
        onReadyRef.current?.()

        // Voice → mouth. Speaking holds for a moment through the gaps between words so the
        // head doesn't flick back to idle on every pause.
        let freq: Uint8Array<ArrayBuffer> | null = null
        let level = 0
        let speaking = false
        let quietSince = 0
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick)
          let target = 0
          const analyser = getAnalyserRef.current()
          if (analyser) {
            if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount)
            analyser.getByteFrequencyData(freq)
            target = Math.min(1, analyseSpectrum(freq, analyser.context.sampleRate, analyser.fftSize).volume * 3)
          }
          level += (target - level) * (target > level ? 0.5 : 0.18)
          loaded.setVoiceLevel(level * 0.7)
          if (level > 0.04) {
            quietSince = 0
            if (!speaking) { speaking = true; loaded.setSpeaking(true) }
          } else if (speaking) {
            if (!quietSince) quietSince = now
            else if (now - quietSince > 600) { speaking = false; loaded.setSpeaking(false) }
          }
        }
        raf = requestAnimationFrame(tick)
      } catch {
        if (!disposed) onFailRef.current?.()
      }
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro?.disconnect()
      if (avatar) {
        avatar.destroy()
        ;(avatar as unknown as { package?: { release(): void } }).package?.release()
      }
    }
  }, [url])

  return (
    <div ref={stageRef} className="avatar-painted" data-ready={ready ? 'true' : 'false'} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}
