'use client'
// Full-screen "talk to Krishna" mode: avatar + outfit picker + captions, and a hands-free
// voice conversation (useVoiceConversation): no text box unless you ask for one. Typing stays
// available behind the keyboard button, and is shown automatically where voice can't work.
// It uses exactly the same chat pipeline and TTS as text mode (the avatar just listens to the
// TTS audio), so there's no second backend path to maintain.

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { InputBar } from '@/components/InputBar'
import { useVoiceConversation, type VoiceState } from '@/hooks/useVoiceConversation'
import { useLang } from '@/components/LangProvider'
import {
  AVATAR_STYLES, DEFAULT_AVATAR_STYLE, DEFAULT_OUTFIT_ID, OUTFITS, loadSavedOutfit, loadSavedStyle, paintedAvatarUrl, rendererFor, saveOutfit, saveStyle,
  type AvatarStyle,
} from '@/lib/avatar/config'

// three.js (~150 KB gz) and the painted player (~25 KB gz) only download when someone opens
// avatar mode, and only the one in use.
const KrishnaAvatar = dynamic(() => import('@/components/KrishnaAvatar'), { ssr: false })
const PaintedAvatar = dynamic(() => import('@/components/PaintedAvatar'), { ssr: false })

type Props = {
  onClose: () => void
  onSend: (message: string) => void
  loading: boolean
  /** Latest assistant reply, shown as a caption. */
  caption: string
  getAnalyser: () => AnalyserNode | null
  /** Stops Kanha's voice (tap the orb while he speaks). */
  onInterrupt?: () => void
}

function OrbIcon({ state }: { state: VoiceState }) {
  if (state === 'speaking') {
    // A square: tap to stop him.
    return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5 10.5a7 7 0 0 0 14 0" />
      <line x1="12" y1="17.5" x2="12" y2="21.5" />
      {state === 'off' && <line x1="4" y1="3" x2="20" y2="21" />}
    </svg>
  )
}

export default function AvatarPanel({ onClose, onSend, loading, caption, getAnalyser, onInterrupt }: Props) {
  const { lang, t } = useLang()
  // Avatar mode only ever renders on the client (opened by a tap), so reading the saved
  // outfit in the initial state is safe and avoids a second render.
  const [outfitId, setOutfitId] = useState(() => (typeof window === 'undefined' ? DEFAULT_OUTFIT_ID : loadSavedOutfit()))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [available, setAvailable] = useState<string[] | null>(null)
  const [style, setStyle] = useState<AvatarStyle>(() => (typeof window === 'undefined' ? DEFAULT_AVATAR_STYLE : loadSavedStyle()))
  // Set when the painted player can't start on this device; 3D takes over for the session.
  const [paintedFailed, setPaintedFailed] = useState(false)
  const voice = useVoiceConversation({ lang, loading, onUtterance: onSend, onInterrupt })
  const voiceBlocked = voice.state === 'unsupported' || voice.state === 'denied'
  const [typing, setTyping] = useState(false)
  const showKeyboard = typing || voiceBlocked

  function toggleTyping() {
    const next = !typing
    setTyping(next)
    voice.setActive(!next)
  }

  const status: Record<VoiceState, string> = {
    off: t('voice.paused'),
    listening: t('voice.listening'),
    thinking: t('voice.thinking'),
    speaking: t('voice.speaking'),
    unsupported: t('voice.unsupported'),
    denied: t('voice.denied'),
  }

  function choose(id: string) {
    setOutfitId(id)
    saveOutfit(id)
  }

  function chooseStyle(next: AvatarStyle) {
    setStyle(next)
    saveStyle(next)
  }

  const renderer = paintedFailed ? '3d' : rendererFor(outfitId, style)
  const paintedUrl = paintedAvatarUrl(outfitId)

  // In 2D poster mode only outfits with a poster image can actually be shown.
  // Every outfit can be shown: one without a painted version is drawn in 3D.
  const selectable = (id: string) => {
    if (renderer === 'painted') return true
    if (!paintedFailed && style === 'painted' && paintedAvatarUrl(id)) return true
    if (available === null) return true
    if (available.length) return available.includes(id)
    return Boolean(OUTFITS.find((o) => o.id === id)?.poster)
  }

  return (
    <div className="avatar-panel theme-night" data-testid="avatar-panel">
      {renderer === 'painted' && paintedUrl ? (
        <PaintedAvatar key={paintedUrl} url={paintedUrl} getAnalyser={getAnalyser} onFail={() => setPaintedFailed(true)} />
      ) : (
        <KrishnaAvatar
          getAnalyser={getAnalyser}
          outfitId={outfitId}
          onModelInfo={({ outfits }) => setAvailable(outfits)}
        />
      )}

      <div className="avatar-topbar">
        <button className="avatar-icon-btn" onClick={onClose} type="button" aria-label={t('avatar.close')}>
          ✕
        </button>
        <button
          className="avatar-icon-btn"
          onClick={() => setPickerOpen((v) => !v)}
          type="button"
          aria-label={t('avatar.choose')}
          aria-expanded={pickerOpen}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 6a2 2 0 1 1 2 2c-1 0-2 .6-2 1.6V10l9 6.2a1.5 1.5 0 0 1-.9 2.8H3.9a1.5 1.5 0 0 1-.9-2.8L12 10" />
          </svg>
        </button>
      </div>

      <p className="avatar-ai-label">{lang === 'hi' ? 'AI चित्रण · दैवी नहीं' : 'AI depiction · not divine'}</p>

      {!pickerOpen && (voice.state === 'listening' && voice.heard ? (
        <p className="avatar-caption avatar-caption--you">{voice.heard}</p>
      ) : caption ? (
        <p className="avatar-caption" aria-live="polite">{caption}</p>
      ) : null)}

      {pickerOpen ? (
        <div className="avatar-sheet" role="dialog" aria-label={t('avatar.choose')}>
          <h2 className="avatar-sheet-title">{t('avatar.choose_title')}</h2>
          {!paintedFailed && (
            <div className="avatar-style" role="group" aria-label={t('avatar.style')}>
              {AVATAR_STYLES.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`avatar-style-btn${style === st ? ' avatar-style-btn--active' : ''}`}
                  aria-pressed={style === st}
                  onClick={() => chooseStyle(st)}
                >
                  {t(st === 'painted' ? 'avatar.style_painted' : 'avatar.style_3d')}
                </button>
              ))}
            </div>
          )}
          <div className="avatar-outfits">
            {OUTFITS.map((o) => {
              const enabled = selectable(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`avatar-outfit${o.id === outfitId ? ' avatar-outfit--active' : ''}`}
                  onClick={() => enabled && choose(o.id)}
                  disabled={!enabled}
                  aria-pressed={o.id === outfitId}
                >
                  <span
                    className="avatar-outfit-thumb"
                    style={o.thumbnail || o.poster
                      ? { backgroundImage: `url(${o.thumbnail ?? o.poster})` }
                      : { background: o.swatch }}
                  />
                  <span className="avatar-outfit-label">{o.label}</span>
                  {!enabled && <span className="avatar-outfit-soon">{t('avatar.soon')}</span>}
                </button>
              )
            })}
          </div>
          <button className="avatar-done" type="button" onClick={() => setPickerOpen(false)}>{t('avatar.done')}</button>
        </div>
      ) : (
        <div className={`avatar-input${showKeyboard ? '' : ' avatar-input--voice'}`}>
          {showKeyboard ? (
            <>
              {voiceBlocked && <p className="avatar-voice-note" role="status">{status[voice.state]}</p>}
              <div className="avatar-type-row">
                <InputBar onSubmit={onSend} loading={loading} />
                {!voiceBlocked && (
                  <button type="button" className="avatar-icon-btn" onClick={toggleTyping} aria-label={t('voice.talk_instead')} title={t('voice.talk_instead')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
                    </svg>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="avatar-voice">
              <span className="avatar-voice-side" aria-hidden="true" />
              <button
                type="button"
                className={`avatar-orb avatar-orb--${voice.state}`}
                onClick={voice.tap}
                disabled={voice.state === 'thinking'}
                aria-label={status[voice.state]}
              >
                <OrbIcon state={voice.state} />
              </button>
              <button type="button" className="avatar-icon-btn avatar-voice-side" onClick={toggleTyping} aria-label={t('voice.type_instead')} title={t('voice.type_instead')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2.5" y="6" width="19" height="12" rx="2" />
                  <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
                </svg>
              </button>
              <p className="avatar-voice-status" aria-live="polite">{status[voice.state]}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
