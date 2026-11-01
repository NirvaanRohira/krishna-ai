'use client'
import { useEffect, useState } from 'react'

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/** "Install Kanha" on Android/desktop Chrome; on iPhone, the Share → Add to Home Screen hint. */
export function InstallButton() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null)
  const [ios, setIos] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as PromptEvent) }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    const t = setTimeout(() => {
      setInstalled(standalone)
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone)
    }, 0)
    return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  if (installed) return null
  if (prompt) {
    return (
      <button type="button" className="btn-ghost" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null) }}>
        Install Kanha on this device
      </button>
    )
  }
  if (ios) return <p className="verse-toggle__note">Keep Kanha on your iPhone: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.</p>
  return null
}
