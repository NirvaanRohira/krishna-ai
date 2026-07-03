'use client'
import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { createClient, AnamEvent, MessageRole } from '@anam-ai/js-sdk'

type AnamClientInstance = ReturnType<typeof createClient>
type TalkStream = ReturnType<AnamClientInstance['createTalkMessageStream']>

export type AnamVideoHandle = {
  talk: (text: string) => Promise<void>
  streamChunk: (chunk: string, isLast: boolean) => Promise<void>
  interrupt: () => void
}

type Props = {
  onClose: () => void
  // Called with a user message (voice transcript or typed). Anam's own LLM is disabled, so
  // the parent runs it through our RAG pipeline and streams the answer back via the ref.
  onUserMessage?: (text: string) => void
}

const GREETING = 'Namaste. I am here with you. What weighs on your heart today?'

const AnamVideoPanel = forwardRef<AnamVideoHandle, Props>(({ onClose, onUserMessage }, ref) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState('')
  const [micDenied, setMicDenied] = useState(false)
  const [textInput, setTextInput] = useState('')
  const clientRef = useRef<AnamClientInstance | null>(null)
  const streamRef = useRef<TalkStream | null>(null)
  // Keep the latest callback in a ref so the (mount-time) listeners never go stale.
  const onUserMessageRef = useRef(onUserMessage)
  onUserMessageRef.current = onUserMessage
  const lastUserMsgIdRef = useRef<string | null>(null)
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
      try { clientRef.current?.interruptPersona() } catch { /* nothing playing */ }
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

        // Greeting must wait for SESSION_READY — talk() throws if the session isn't
        // streaming yet, which is why the greeting was silent before.
        client.addListener(AnamEvent.SESSION_READY, () => {
          client.talk(GREETING).catch(() => {})
        })

        // Voice path: Anam transcribes the user's speech and updates the message history
        // when they finish speaking. Grab the newest user utterance (deduped by id) → RAG.
        client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
          const userMsgs = messages.filter((m) => m.role === MessageRole.USER)
          const last = userMsgs[userMsgs.length - 1]
          if (!last || last.id === lastUserMsgIdRef.current) return
          lastUserMsgIdRef.current = last.id
          const text = last.content?.trim()
          if (text) onUserMessageRef.current?.(text)
        })

        // Surface mic problems so the user knows to type instead of speak.
        client.addListener(AnamEvent.MIC_PERMISSION_DENIED, () => { if (!cancelled) setMicDenied(true) })
        client.addListener(AnamEvent.MIC_PERMISSION_GRANTED, () => { if (!cancelled) setMicDenied(false) })

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

  function submitText(e: React.FormEvent) {
    e.preventDefault()
    const t = textInput.trim()
    if (!t) return
    onUserMessageRef.current?.(t)
    setTextInput('')
  }

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
            Set ANAM_PERSONA_ID (or ANAM_AVATAR_ID + ANAM_VOICE_ID) in .env.local to enable video.
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

      {/* Speak (Anam transcribes), or type — either path runs the RAG pipeline and the
          avatar speaks the answer. Text input guarantees the demo works even if the mic is blocked. */}
      {status === 'connected' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)' }}>
          {micDenied && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#ffd7d7', textAlign: 'center' }}>
              Microphone blocked — type below to talk to Krishna.
            </p>
          )}
          <form onSubmit={submitText} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Speak, or type to Krishna…"
              aria-label="Message Krishna"
              style={{ flex: 1, padding: '0.6rem 0.8rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: '0.9rem' }}
            />
            <button
              type="submit"
              aria-label="Send message"
              style={{ padding: '0.6rem 1rem', borderRadius: '999px', border: 'none', background: 'var(--accent, #d98b3a)', color: '#fff', fontSize: '0.9rem', cursor: 'pointer' }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
})

AnamVideoPanel.displayName = 'AnamVideoPanel'
export default AnamVideoPanel
