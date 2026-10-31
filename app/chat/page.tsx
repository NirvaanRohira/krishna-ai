'use client'
import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ChatWindow } from '@/components/ChatWindow'
import { DisclaimerBadge } from '@/components/DisclaimerBadge'
import AvatarPanel from '@/components/AvatarPanel'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useTTS } from '@/hooks/useTTS'

type Message = { role: 'user' | 'assistant'; content: string }

const FALLBACK_ERROR = 'Something went wrong. Please try again.'

async function consumeStream(
  res: Response,
  onChunk: (text: string) => void,
  onMeta: (sessionId: string) => void,
  onError: (msg: string) => void,
) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue
      try {
        const d = JSON.parse(line.slice(6))
        if (d.t === 's') onMeta(d.id)
        if (d.t === 'c') onChunk(d.v)
        if (d.t === 'e') onError(d.msg ?? FALLBACK_ERROR)
      } catch { /* skip malformed lines */ }
    }
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Avatar mode: real-time 3D Krishna rendered on-device, lip-synced to the TTS audio.
  const [videoMode, setVideoMode] = useState(false)
  const router = useRouter()
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  // Keep a ref in sync so the beforeunload/visibilitychange closure always
  // sees the current sessionId without needing to re-register the listener.
  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = sessionId
  // Tracks the session id whose end-beacon has already been sent, so the same
  // end fires the beacon at most once even though pagehide + visibilitychange +
  // beforeunload can all fire in sequence. Reset when a new session begins.
  const beaconSentForRef = useRef<string | null>(null)
  if (sessionId && beaconSentForRef.current !== null && beaconSentForRef.current !== sessionId) {
    beaconSentForRef.current = null
  }
  const {
    enqueue, stop, toggle, enabled: ttsEnabled, unlockAudio,
    setEnabled: setTTSEnabled, setAnalyse, getAnalyser,
  } = useTTS()
  const sentenceBufferRef = useRef('')

  // The avatar speaks every reply, so voice is forced on and playback is routed through
  // the analyser that drives lip-sync. Text mode plays audio directly.
  useEffect(() => {
    setAnalyse?.(videoMode)
    if (videoMode) setTTSEnabled?.(true)
  }, [videoMode, setAnalyse, setTTSEnabled])

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
    })
  }, [router])

  // End the session when the user closes or hides the tab so post-session
  // profile extraction fires. sendBeacon works on tab close; fetch does not.
  //
  // Mobile browsers freeze JS the instant the tab is hidden and fire
  // `beforeunload` unreliably, so a delayed timer never runs. We must send the
  // beacon *synchronously* on the first reliable signal. `pagehide` is the
  // canonical mobile signal; `visibilitychange → hidden` covers backgrounding;
  // `beforeunload` covers desktop tab/window close. A ref-based guard keyed to
  // the session id ensures the beacon body is sent at most once per session
  // even though several of these events can fire in a row. No timers/polling.
  useEffect(() => {
    const endSession = () => {
      const id = sessionIdRef.current
      if (!id) return
      if (beaconSentForRef.current === id) return // already sent for this session
      beaconSentForRef.current = id
      navigator.sendBeacon(
        '/api/session/end',
        new Blob([JSON.stringify({ sessionId: id })], { type: 'application/json' })
      )
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') endSession()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', endSession)
    window.addEventListener('beforeunload', endSession)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', endSession)
      window.removeEventListener('beforeunload', endSession)
    }
  }, [])

  async function handleSend(message: string) {
    unlockAudio()
    // Capture history before any state mutations
    const priorMessages = [...messagesRef.current]
    const withUser: Message[] = [...priorMessages, { role: 'user', content: message }]
    setMessages(withUser)
    setLoading(true)

    // Placeholder so user sees something immediately
    const withPlaceholder: Message[] = [...withUser, { role: 'assistant', content: '' }]
    setMessages(withPlaceholder)
    stop()
    sentenceBufferRef.current = ''

    // After 700ms with no content, show a thinking phrase in text and speak it (if TTS on)
    let firstChunkReceived = false
    const thinkingPhrases = [
      'Hmm...',
      'Let me reflect on this...',
      'The texts speak to this...',
      'Give me a moment...',
    ]
    let thinkingIndex = 0
    let thinkingInterval: ReturnType<typeof setInterval> | undefined

    const showThinkingPhrase = () => {
      if (firstChunkReceived) return
      const phrase = thinkingPhrases[thinkingIndex++ % thinkingPhrases.length]
      if (ttsEnabled) enqueue(phrase)
      flushSync(() => setMessages([...withUser, { role: 'assistant', content: phrase }]))
    }

    const thinkingTimer = setTimeout(() => {
      if (firstChunkReceived) return
      showThinkingPhrase()
      thinkingInterval = setInterval(() => {
        if (firstChunkReceived) { clearInterval(thinkingInterval); return }
        showThinkingPhrase()
      }, 4000)
    }, 1500)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // History is loaded server-side from the session; the client only names the session.
        body: JSON.stringify({ message, sessionId, mode: videoMode ? 'voice' : 'text' }),
      })

      if (res.status === 401) {
        router.push('/login')
        return
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        setMessages([...withUser, { role: 'assistant', content: data.error ?? FALLBACK_ERROR }])
        return
      }

      let assembled = ''
      let errorMsg = ''

      await consumeStream(
        res,
        (chunk) => {
          if (!firstChunkReceived) {
            firstChunkReceived = true
            if (thinkingTimer !== undefined) clearTimeout(thinkingTimer)
            if (thinkingInterval !== undefined) clearInterval(thinkingInterval)
          }
          assembled += chunk
          sentenceBufferRef.current += chunk
          // Enqueue completed sentences to TTS mid-stream (the avatar lip-syncs to this audio)
          const boundary = sentenceBufferRef.current.search(/[.!?।॥]\s/)
          if (boundary !== -1) {
            const sentence = sentenceBufferRef.current.slice(0, boundary + 1)
            sentenceBufferRef.current = sentenceBufferRef.current.slice(boundary + 2)
            enqueue(sentence)
          }
          flushSync(() => {
            setMessages([...withUser, { role: 'assistant', content: assembled }])
          })
        },
        (id) => {
          // The server may start a fresh session (e.g. the old one ended when the tab was
          // hidden, or after a crisis response) — always follow its id.
          if (id && id !== sessionIdRef.current) setSessionId(id)
        },
        (msg) => {
          errorMsg = msg
        },
      )

      if (assembled === '') {
        setMessages([...withUser, { role: 'assistant', content: errorMsg || FALLBACK_ERROR }])
      } else {
        // The model streamed partial content and *then* the server emitted an
        // error event. Without a visible marker the user (and TTS) would treat
        // the truncated reply as a complete answer. Append an inline notice so
        // it's clear the response was cut off.
        if (errorMsg) {
          assembled += '\n\n_(response interrupted — please try again)_'
          flushSync(() => {
            setMessages([...withUser, { role: 'assistant', content: assembled }])
          })
        }
        // Flush any remaining partial sentence for TTS
        if (sentenceBufferRef.current.trim()) enqueue(sentenceBufferRef.current.trim())
        sentenceBufferRef.current = ''
      }
    } catch {
      setMessages([...withUser, { role: 'assistant', content: FALLBACK_ERROR }])
    } finally {
      if (thinkingTimer !== undefined) clearTimeout(thinkingTimer)
      if (thinkingInterval !== undefined) clearInterval(thinkingInterval)
      setLoading(false)
    }
  }

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? ''

  return (
    <main className="chat-page">
      <DisclaimerBadge />
      <button
        onClick={() => { toggle(); stop() }}
        className={`tts-toggle${ttsEnabled ? ' tts-toggle--active' : ''}`}
        title={ttsEnabled ? 'Mute voice' : 'Unmute voice'}
        aria-label={ttsEnabled ? 'Mute voice' : 'Unmute voice'}
        type="button"
      >
        {ttsEnabled ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <line x1="23" y1="9" x2="17" y2="15"/>
            <line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
        )}
      </button>
      <button
        onClick={() => setVideoMode(v => !v)}
        className={`tts-toggle video-toggle${videoMode ? ' tts-toggle--active' : ''}`}
        title="Talk to Krishna (3D avatar)"
        aria-label="Talk to Krishna (3D avatar)"
        type="button"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
      </button>
      {videoMode ? (
        <AvatarPanel
          onClose={() => setVideoMode(false)}
          onSend={handleSend}
          loading={loading}
          caption={lastAssistant}
          getAnalyser={getAnalyser}
        />
      ) : (
        <ChatWindow messages={messages} onSend={handleSend} loading={loading} />
      )}
    </main>
  )
}
