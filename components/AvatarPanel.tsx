'use client'
// Full-screen "talk to Krishna" mode: 3D avatar + outfit picker + captions + the normal
// input bar. It uses exactly the same chat pipeline and TTS as text mode — the avatar
// just listens to the TTS audio — so there's no second backend path to maintain.

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { InputBar } from '@/components/InputBar'
import { useLang } from '@/components/LangProvider'
import {
  AVATAR_STYLES, OUTFITS, loadSavedOutfit, loadSavedStyle, paintedAvatarUrl, rendererFor, saveOutfit, saveStyle,
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
}

export default function AvatarPanel({ onClose, onSend, loading, caption, getAnalyser }: Props) {
  const { lang, t } = useLang()
  // Avatar mode only ever renders on the client (opened by a tap), so reading the saved
  // outfit in the initial state is safe and avoids a second render.
  const [outfitId, setOutfitId] = useState(() => (typeof window === 'undefined' ? 'divine' : loadSavedOutfit()))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [available, setAvailable] = useState<string[] | null>(null)
  const [style, setStyle] = useState<AvatarStyle>(() => (typeof window === 'undefined' ? 'painted' : loadSavedStyle()))
  // Set when the painted player can't start on this device; 3D takes over for the session.
  const [paintedFailed, setPaintedFailed] = useState(false)

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
  const selectable = (id: string) => {
    if (renderer === 'painted') return Boolean(paintedAvatarUrl(id))
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

      {caption && !pickerOpen && (
        <p className="avatar-caption" aria-live="polite">{caption}</p>
      )}

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
        <div className="avatar-input">
          <InputBar onSubmit={onSend} loading={loading} />
        </div>
      )}
    </div>
  )
}
