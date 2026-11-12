'use client'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ChatWindow } from '@/components/ChatWindow'
import { DisclaimerBadge } from '@/components/DisclaimerBadge'
import AvatarPanel from '@/components/AvatarPanel'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useTTS } from '@/hooks/useTTS'
import { cleanSources, type Source } from '@/lib/sources'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'
import { toSpeech, toPlain } from '@/lib/scripture-page'
import { useAmbient } from '@/hooks/useAmbient'
import { usePlan } from '@/hooks/usePlan'
import { useLang } from '@/components/LangProvider'
import { LanguageToggle } from '@/components/LanguageToggle'
import { formatDate } from '@/lib/i18n'

type Message = { role: 'user' | 'assistant'; content: string; sources?: Source[] }

const FALLBACK_ERROR = 'Something went wrong. Please try again.'

async function consumeStream(
  res: Response,
  onChunk: (text: string) => void,
  onMeta: (sessionId: string, sources: Source[] | null) => void,
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
        if (d.t === 's') onMeta(d.id, 'src' in d ? cleanSources(d.src) : null)
        if (d.t === 'c') onChunk(d.v)
        if (d.t === 'e') onError((d.msg ?? FALLBACK_ERROR) + (typeof d.code === 'string' && /^[a-z_]{2,20}$/.test(d.code) ? ` (code: ${d.code})` : ''))
      } catch { /* skip malformed lines */ }
    }
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const plan = usePlan()
  const { lang, t } = useLang()
  const planName = t(plan.plan === 'premium' ? 'plan.premium' : plan.plan === 'plus' ? 'plan.plus' : 'plan.free')
  const planDate = plan.validUntil ? formatDate(lang, plan.validUntil) : ''
  const ambient = useAmbient()
  // Avatar mode: real-time 3D Krishna rendered on-device, lip-synced to the TTS audio.
  const [videoMode, setVideoMode] = useState(false)
  const router = useRouter()
  const messagesRef = useRef(messages)
  // Keep a ref in sync so the beforeunload/visibilitychange closure always
  // sees the current sessionId without needing to re-register the listener.
  const sessionIdRef = useRef<string | null>(null)
  // Refs are synced after render (React 19 forbids writing refs during render).
  useLayoutEffect(() => {
    messagesRef.current = messages
    sessionIdRef.current = sessionId
  }, [messages, sessionId])
  // Tracks the session id whose end-beacon has already been sent, so the same
  // end fires the beacon at most once even though pagehide + visibilitychange +
  // beforeunload can all fire in sequence. A new session has a new id, so it
  // never matches and its own beacon is sent — no reset needed.
  const beaconSentForRef = useRef<string | null>(null)
  const {
    enqueue, stop, toggle, enabled: ttsEnabled, unlockAudio,
    setEnabled: setTTSEnabled, setAnalyse, getAnalyser,
  } = useTTS({
    // Voice is opt-in in text mode: most people read, and speaking every reply roughly
    // doubles the cost of a conversation. Avatar mode switches it on (below).
    defaultEnabled: false,
  })

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

  // Set when the person interrupts Kanha in voice mode: the rest of that reply stays silent.
  const silencedRef = useRef(false)
  const say = (text: string) => { if (!silencedRef.current) enqueue(text) }
  const interrupt = () => { silencedRef.current = true; stop() }

  async function handleSend(message: string) {
    silencedRef.current = false
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
      if (ttsEnabled) say(phrase)
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
        body: JSON.stringify({ message, sessionId, mode: videoMode ? 'voice' : 'text', lang }),
      })

      if (res.status === 401) {
        router.push('/login')
        return
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        // A short status code makes "something went wrong" diagnosable from a screenshot.
        setMessages([...withUser, { role: 'assistant', content: data.error ?? `${t('common.something_wrong')} (code: http_${res.status})` }])
        return
      }

      let assembled = ''
      let spokenUpTo = 0
      let errorMsg = ''
      let sources: Source[] = []

      await consumeStream(
        res,
        (chunk) => {
          if (!firstChunkReceived) {
            firstChunkReceived = true
            if (thinkingTimer !== undefined) clearTimeout(thinkingTimer)
            if (thinkingInterval !== undefined) clearInterval(thinkingInterval)
          }
          assembled += chunk
          // Speak what the reader sees: page markup becomes prose, and a sentence is queued
          // for the voice as soon as it's complete (the avatar lip-syncs to this audio).
          const speech = toSpeech(assembled)
          const pending = speech.slice(spokenUpTo)
          const lastEnd = Math.max(...['. ', '! ', '? ', '। ', '॥ '].map((p) => pending.lastIndexOf(p)))
          if (lastEnd >= 0) {
            say(pending.slice(0, lastEnd + 1).trim())
            spokenUpTo += lastEnd + 2
          }
          flushSync(() => {
            setMessages([...withUser, { role: 'assistant', content: assembled, sources }])
          })
        },
        (id, src) => {
          if (src) sources = src
          // The server may start a fresh session (e.g. the old one ended when the tab was
          // hidden, or after a crisis response) — always follow its id.
          if (id && id !== sessionIdRef.current) setSessionId(id)
        },
        (msg) => {
          errorMsg = msg
        },
      )

      if (assembled === '') {
        setMessages([...withUser, { role: 'assistant', content: errorMsg || `${t('common.something_wrong')} (code: empty_reply)` }])
      } else {
        // The model streamed partial content and *then* the server emitted an
        // error event. Without a visible marker the user (and TTS) would treat
        // the truncated reply as a complete answer. Append an inline notice so
        // it's clear the response was cut off.
        if (errorMsg) {
          assembled += '\n\n(The response was interrupted. Please try again.)'
          flushSync(() => {
            setMessages([...withUser, { role: 'assistant', content: assembled }])
          })
        }
        // Attach the verses this answer drew on (shown under the reply once it completes).
        if (sources.length) {
          setMessages([...withUser, { role: 'assistant', content: assembled, sources }])
        }
        // Flush any remaining partial sentence for TTS
        const rest = toSpeech(assembled).slice(spokenUpTo).trim()
        if (rest) say(rest)
      }
    } catch {
      setMessages([...withUser, { role: 'assistant', content: `${t('common.something_wrong')} (code: network)` }])
    } finally {
      if (thinkingTimer !== undefined) clearTimeout(thinkingTimer)
      if (thinkingInterval !== undefined) clearInterval(thinkingInterval)
      setLoading(false)
    }
  }

  const lastAssistant = toPlain([...messages].reverse().find(m => m.role === 'assistant')?.content ?? '')

  return (
    <main className="chat-page">
      <header className="chat-header">
        <Link href="/" className="chat-wordmark" aria-label={t('chat.home')}>{lang === 'hi' ? 'कान्हा' : 'Kanha'}</Link>
        <button
          onClick={() => { toggle(); stop() }}
          className="icon-btn"
          aria-pressed={ttsEnabled}
          title={ttsEnabled ? t('chat.mute') : t('chat.unmute')}
          aria-label={ttsEnabled ? t('chat.mute') : t('chat.unmute')}
          type="button"
        >
          {ttsEnabled ? (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          ) : (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m22 9-6 6M16 9l6 6" />
            </svg>
          )}
        </button>
        <button
          onClick={() => setVideoMode(v => !v)}
          className="icon-btn"
          aria-pressed={videoMode}
          title={t('chat.face')}
          aria-label={t('chat.face_label')}
          type="button"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /><path d="M12 2.5c1.5-1 3.5-.6 4.2.9" />
          </svg>
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={ambient.toggle}
          aria-pressed={ambient.on}
          aria-label={ambient.on ? t('chat.ambient_on') : t('chat.ambient_off')}
          title={ambient.on ? t('chat.ambient_title_on') : t('chat.ambient_title_off')}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v11" /><circle cx="12" cy="17.5" r="3.5" /><path d="M12 3c2.5 1.5 4.5 1.5 6 0" />
            {ambient.on && <path d="M4 10c1.2 1.2 1.2 4.8 0 6" />}
          </svg>
        </button>
        <LanguageToggle />
        <ThemeToggle />
        <Link href="/history" className="icon-btn" aria-label={t('chat.history')} title={t('chat.history')}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" />
          </svg>
        </Link>
        <Link
          href="/pricing"
          className="icon-btn"
          aria-label={plan.plan === 'free' ? t('chat.plans_label') : planDate ? t('chat.plan_until', { plan: planName, date: planDate }) : t('chat.plan_named', { plan: planName })}
          title={plan.plan === 'free' ? t('common.plans') : planDate ? t('chat.plan_until', { plan: planName, date: planDate }) : t('chat.plan_named', { plan: planName })}
          aria-current={plan.plan !== 'free' ? 'true' : undefined}
          data-paid={plan.plan !== 'free' ? 'true' : undefined}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill={plan.plan !== 'free' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
          </svg>
        </Link>
        <Link href="/account" className="icon-btn" aria-label={t('chat.account_label')} title={t('chat.account')}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </svg>
        </Link>
      </header>
      <DisclaimerBadge />
      {videoMode ? (
        <AvatarPanel
          onClose={() => setVideoMode(false)}
          onSend={handleSend}
          loading={loading}
          caption={lastAssistant}
          getAnalyser={getAnalyser}
          onInterrupt={interrupt}
        />
      ) : (
        <ChatWindow messages={messages} onSend={handleSend} loading={loading} />
      )}
    </main>
  )
}
