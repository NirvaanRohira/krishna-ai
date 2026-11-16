'use client'
// The avatar stage for the mobile apps (app/embed/avatar). The app talks to it with two calls,
// and hears back through `window.KanhaApp.postMessage` (an Android WebMessageListener limited to
// this site's origin):
//
//   kanhaAvatar.play(base64Mp3, id)  plays one piece of Kanha's voice; the mouth follows it.
//                                    → {type:'started', id}, then {type:'ended', id} when it
//                                      finishes (or fails). No 'started' in time: the app plays
//                                      the audio itself (some WebViews block page audio).
//   kanhaAvatar.stop()               silences him at once (the person tapped to interrupt)
//   kanhaAvatar.setOutfit(id)        royal | pastoral | divine
//   on load                          → {type:'ready'}; if the painted player can't start, 3D takes over
//
// The audio goes through an AnalyserNode, exactly as on the website, so lip-sync is identical.

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { OUTFITS, DEFAULT_AVATAR_STYLE, paintedAvatarUrl, rendererFor } from '@/lib/avatar/config'

const KrishnaAvatar = dynamic(() => import('@/components/KrishnaAvatar'), { ssr: false })
const PaintedAvatar = dynamic(() => import('@/components/PaintedAvatar'), { ssr: false })

type Bridge = { postMessage: (message: string) => void }
type AvatarApi = { play: (b64: string, id: number) => void; stop: () => void; setOutfit: (id: string) => void }

function tell(message: Record<string, unknown>) {
  const bridge = (window as unknown as { KanhaApp?: Bridge }).KanhaApp
  try { bridge?.postMessage(JSON.stringify(message)) } catch { /* no app listening (a browser) */ }
}

function bytesFrom(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

export default function AvatarEmbed({ initialOutfit }: { initialOutfit: string }) {
  const [outfit, setOutfit] = useState(initialOutfit)
  const [paintedFailed, setPaintedFailed] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const playingRef = useRef<{ source: AudioBufferSourceNode; id: number } | null>(null)

  const getAnalyser = useCallback(() => analyserRef.current, [])

  useEffect(() => {
    const context = (): AudioContext => {
      if (!ctxRef.current) {
        const ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        analyser.connect(ctx.destination)
        ctxRef.current = ctx
        analyserRef.current = analyser
      }
      return ctxRef.current
    }

    const stop = () => {
      const p = playingRef.current
      playingRef.current = null
      if (p) { p.source.onended = null; try { p.source.stop() } catch { /* already stopped */ } }
    }

    const api: AvatarApi = {
      play(b64, id) {
        stop()
        const ctx = context()
        ;(async () => {
          try {
            if (ctx.state !== 'running') await ctx.resume()
            const buffer = await ctx.decodeAudioData(bytesFrom(b64))
            const source = ctx.createBufferSource()
            source.buffer = buffer
            source.connect(analyserRef.current!)
            source.onended = () => {
              if (playingRef.current?.source === source) playingRef.current = null
              tell({ type: 'ended', id })
            }
            playingRef.current = { source, id }
            source.start()
            tell({ type: 'started', id })
          } catch {
            tell({ type: 'ended', id, failed: true })
          }
        })()
      },
      stop,
      setOutfit(id) {
        if (OUTFITS.some((o) => o.id === id)) { setOutfit(id); setPaintedFailed(false) }
      },
    }
    ;(window as unknown as { kanhaAvatar?: AvatarApi }).kanhaAvatar = api
    tell({ type: 'ready' })
    return () => {
      stop()
      ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
      analyserRef.current = null
      delete (window as unknown as { kanhaAvatar?: AvatarApi }).kanhaAvatar
    }
  }, [])

  const renderer = paintedFailed ? '3d' : rendererFor(outfit, DEFAULT_AVATAR_STYLE)
  const paintedUrl = paintedAvatarUrl(outfit)
  return (
    <div className="avatar-panel avatar-embed theme-night">
      {renderer === 'painted' && paintedUrl ? (
        <PaintedAvatar key={paintedUrl} url={paintedUrl} getAnalyser={getAnalyser} onFail={() => setPaintedFailed(true)} />
      ) : (
        <KrishnaAvatar getAnalyser={getAnalyser} outfitId={outfit} />
      )}
    </div>
  )
}
