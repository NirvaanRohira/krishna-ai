'use client'
import { useEffect, useState } from 'react'

function keyBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

type State = 'unsupported' | 'ios-install' | 'off' | 'on' | 'blocked' | 'busy'

/** "Send me the verse each morning": browser permission + a stored subscription. One tap off. */
export function DailyVerseToggle() {
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
    })().catch(() => { if (live) setState('unsupported') })
    return () => { live = false }
  }, [])

  async function turnOn() {
    setMsg(null)
    setState('busy')
    try {
      if ((await Notification.requestPermission()) !== 'granted') { setState('blocked'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource })
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
      if (res.status === 401) { await sub.unsubscribe(); setMsg('Sign in first, then turn this on.'); setState('off'); return }
      if (!res.ok) { await sub.unsubscribe(); throw new Error('subscribe failed') }
      setState('on')
      setMsg('Done. Your verse will arrive each morning around 6:30.')
    } catch {
      setState('off')
      setMsg('Could not turn on notifications. Please try again.')
    }
  }

  async function turnOff() {
    setState('busy')
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub?.endpoint }) }).catch(() => null)
    await sub?.unsubscribe().catch(() => {})
    setState('off')
    setMsg('Turned off. No more morning notifications.')
  }

  return (
    <div className="verse-toggle">
      {state === 'on' && <button type="button" className="btn-ghost" onClick={turnOff}>Stop the morning verse</button>}
      {state === 'off' && <button type="button" className="btn-primary" onClick={turnOn}>Send me a verse each morning</button>}
      {state === 'busy' && <button type="button" className="btn-ghost" disabled>One moment…</button>}
      {state === 'blocked' && <p className="verse-toggle__note">Notifications are blocked for this site. Allow them in your browser&rsquo;s site settings to get the morning verse.</p>}
      {state === 'ios-install' && <p className="verse-toggle__note">On iPhone: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, open Kanha from there, and then you can turn on the morning verse.</p>}
      {state === 'unsupported' && <p className="verse-toggle__note">This browser can&rsquo;t receive notifications. Come back here each morning for the day&rsquo;s verse.</p>}
      {msg && <p className="verse-toggle__note" role="status">{msg}</p>}
    </div>
  )
}
