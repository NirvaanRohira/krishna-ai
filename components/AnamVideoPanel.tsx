'use client'
import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { createClient } from '@anam-ai/js-sdk'

type AnamClientInstance = ReturnType<typeof createClient>
type TalkStream = ReturnType<AnamClientInstance['createTalkMessageStream']>

export type AnamVideoHandle = {
  talk: (text: string) => Promise<void>
  streamChunk: (chunk: string, isLast: boolean) => Promise<void>
  interrupt: () => void
}

type Props = {
  onClose: () => void
}

const AnamVideoPanel = forwardRef<AnamVideoHandle, Props>(({ onClose }, ref) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState('')
  const clientRef = useRef<AnamClientInstance | null>(null)
  const streamRef = useRef<TalkStream | null>(null)
  const videoId = 'anam-video-el'

  useImperativeHandle(ref, () => ({
    async talk(text: string) {
      if (!clientRef.current) return
      try { await clientRef.current.talk(text) } catch { /* ignore if not streaming */ }
    },
    async streamChunk(chunk: string, isLast: boolean) {
      if (!clientRef.current) return
      if (!streamRef.current || !streamRef.current.isActive()) {
        streamRef.current = clientRef.current.createTalkMessageStream()
      }
      try {
        await streamRef.current.streamMessageChunk(chunk, isLast)
        if (isLast) await streamRef.current.endMessage()
      } catch { /* ignore mid-stream errors */ }
    },
    interrupt() {
      clientRef.current?.interruptPersona()
      streamRef.current = null
    },
  }))

  useEffect(() => {
    let cancelled = false

    async function connect() {
      try {
        const res = await fetch('/api/anam/session', { method: 'POST' })
        if (!res.ok) throw new Error(`Session error ${res.status}`)
        const { sessionToken } = await res.json()
        if (cancelled) return

        const client = createClient(sessionToken)
        clientRef.current = client
        await client.streamToVideoElement(videoId)
        if (!cancelled) setStatus('connected')
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Connection failed')
          setStatus('error')
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      clientRef.current?.stopStreaming().catch(() => {})
      clientRef.current = null
      streamRef.current = null
    }
  }, [])

  return (
    <div className="anam-panel">
      <button className="anam-close" onClick={onClose} type="button" aria-label="Close video">
        ✕
      </button>

      {status === 'connecting' && (
        <div className="anam-overlay">
          <div className="anam-spinner" />
          <p>Connecting to Krishna...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="anam-overlay anam-error">
          <p>Could not connect</p>
          <p className="anam-error-detail">{errorMsg}</p>
          <p className="anam-error-hint">
            Set ANAM_PERSONA_ID, ANAM_AVATAR_ID and ANAM_VOICE_ID in .env.local to enable video.
          </p>
        </div>
      )}

      {/* Video element is always mounted so the SDK can attach to it */}
      <video
        id={videoId}
        autoPlay
        playsInline
        className={`anam-video${status === 'connected' ? ' anam-video--visible' : ''}`}
      />
    </div>
  )
})

AnamVideoPanel.displayName = 'AnamVideoPanel'
export default AnamVideoPanel
