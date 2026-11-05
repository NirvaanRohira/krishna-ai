'use client'
import { useEffect, useState } from 'react'
import { useLang } from '@/components/LangProvider'

function keyBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

type State = 'unsupported' | 'ios-install' | 'off' | 'on' | 'blocked' | 'busy'

/** "Send me the verse each morning": browser permission + a stored subscription. One tap off. */
export function DailyVerseToggle({ compact = false }: { compact?: boolean } = {}) {
  const { lang, t } = useLang()
  const [state, setState] = useState<State>('busy')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        if (live) setState(ios && !standalone ? 'ios-install' : 'unsupported')
        return
      }
      if (Notification.permission === 'denied') { if (live) setState('blocked'); return }
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (live) setState(sub ? 'on' : 'off')
      // Already subscribed but the interface language changed since: tell the server, so the
      // morning notification arrives in the language they now use.
      if (sub) {
        let saved: string | null = null
        try { saved = localStorage.getItem('kanha.push_lang') } catch { /* storage blocked */ }
        if (saved !== lang) {
          const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sub.toJSON(), lang }) }).catch(() => null)
          if (r?.ok) try { localStorage.setItem('kanha.push_lang', lang) } catch { /* storage blocked */ }
        }
      }
    })().catch(() => { if (live) setState('unsupported') })
    return () => { live = false }
  }, [lang])

  async function turnOn() {
    setMsg(null)
    setState('busy')
    try {
      if ((await Notification.requestPermission()) !== 'granted') { setState('blocked'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource })
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sub.toJSON(), lang }) })
      if (res.status === 401) { await sub.unsubscribe(); setMsg(t('push.sign_in')); setState('off'); return }
      if (!res.ok) { await sub.unsubscribe(); throw new Error('subscribe failed') }
      try { localStorage.setItem('kanha.push_lang', lang) } catch { /* storage blocked */ }
      setState('on')
      setMsg(t('push.done'))
    } catch {
      setState('off')
      setMsg(t('push.failed'))
    }
  }

  async function turnOff() {
    setState('busy')
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub?.endpoint }) }).catch(() => null)
    await sub?.unsubscribe().catch(() => {})
    setState('off')
    setMsg(t('push.stopped'))
  }

  // Inside today's-verse card: just the offer, only when it can be taken up.
  if (compact) {
    if (state !== 'off' && !msg) return null
    return (
      <div className="verse-toggle verse-toggle--compact">
        {state === 'off' && <button type="button" onClick={turnOn}>{t('push.on_compact')}</button>}
        {msg && <p className="verse-toggle__note" role="status">{msg}</p>}
      </div>
    )
  }

  return (
    <div className="verse-toggle">
      {state === 'on' && <button type="button" className="btn-ghost" onClick={turnOff}>{t('push.off')}</button>}
      {state === 'off' && <button type="button" className="btn-primary" onClick={turnOn}>{t('push.on')}</button>}
      {state === 'busy' && <button type="button" className="btn-ghost" disabled>{t('push.busy')}</button>}
      {state === 'blocked' && <p className="verse-toggle__note">{t('push.blocked')}</p>}
      {state === 'ios-install' && <p className="verse-toggle__note">{t('push.ios')}</p>}
      {state === 'unsupported' && <p className="verse-toggle__note">{t('push.unsupported')}</p>}
      {msg && <p className="verse-toggle__note" role="status">{msg}</p>}
    </div>
  )
}
