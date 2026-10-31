'use client'
// Full-screen "talk to Krishna" mode: 3D avatar + outfit picker + captions + the normal
// input bar. It uses exactly the same chat pipeline and TTS as text mode — the avatar
// just listens to the TTS audio — so there's no second backend path to maintain.

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { InputBar } from '@/components/InputBar'
import { OUTFITS, loadSavedOutfit, saveOutfit } from '@/lib/avatar/config'

// three.js (~150 KB gz) only downloads when someone opens avatar mode.
const KrishnaAvatar = dynamic(() => import('@/components/KrishnaAvatar'), { ssr: false })

type Props = {
  onClose: () => void
  onSend: (message: string) => void
  loading: boolean
  /** Latest assistant reply, shown as a caption. */
  caption: string
  getAnalyser: () => AnalyserNode | null
}

export default function AvatarPanel({ onClose, onSend, loading, caption, getAnalyser }: Props) {
  const [outfitId, setOutfitId] = useState('divine')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [available, setAvailable] = useState<string[] | null>(null)

  useEffect(() => { setOutfitId(loadSavedOutfit()) }, [])

  function choose(id: string) {
    setOutfitId(id)
    saveOutfit(id)
  }

  // In 2D poster mode only outfits with a poster image can actually be shown.
  const selectable = (id: string) => {
    if (available === null) return true
    if (available.length) return available.includes(id)
    return Boolean(OUTFITS.find((o) => o.id === id)?.poster)
  }

  return (
    <div className="avatar-panel" data-testid="avatar-panel">
      <KrishnaAvatar
        getAnalyser={getAnalyser}
        outfitId={outfitId}
        onModelInfo={({ outfits }) => setAvailable(outfits)}
      />

      <div className="avatar-topbar">
        <button className="avatar-icon-btn" onClick={onClose} type="button" aria-label="Close avatar">
          ✕
        </button>
        <button
          className="avatar-icon-btn"
          onClick={() => setPickerOpen((v) => !v)}
          type="button"
          aria-label="Choose outfit"
          aria-expanded={pickerOpen}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 6a2 2 0 1 1 2 2c-1 0-2 .6-2 1.6V10l9 6.2a1.5 1.5 0 0 1-.9 2.8H3.9a1.5 1.5 0 0 1-.9-2.8L12 10" />
          </svg>
        </button>
      </div>

      <p className="avatar-ai-label">AI depiction · not divine</p>

      {caption && !pickerOpen && (
        <p className="avatar-caption" aria-live="polite">{caption}</p>
      )}

      {pickerOpen ? (
        <div className="avatar-sheet" role="dialog" aria-label="Choose outfit">
          <h2 className="avatar-sheet-title">Choose Outfit</h2>
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
                  {!enabled && <span className="avatar-outfit-soon">Soon</span>}
                </button>
              )
            })}
          </div>
          <button className="avatar-done" type="button" onClick={() => setPickerOpen(false)}>Done</button>
        </div>
      ) : (
        <div className="avatar-input">
          <InputBar onSubmit={onSend} loading={loading} />
        </div>
      )}
    </div>
  )
}
