'use client'
import { useEffect, useState } from 'react'
import { useLang } from '@/components/LangProvider'

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/** "Install Kanha" on Android/desktop Chrome; on iPhone, the Share → Add to Home Screen hint. */
export function InstallButton() {
  const { t: tr } = useLang()
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
        {tr('install.button')}
      </button>
    )
  }
  if (ios) return <p className="verse-toggle__note">{tr('install.ios')}</p>
  return null
}
