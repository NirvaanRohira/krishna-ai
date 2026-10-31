'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HairlineFigure } from '@/components/HairlineFigure'

const PHRASE = 'DELETE MY ACCOUNT'

type Memory = {
  life_context: string | null
  life_stage: string | null
  themes: string[]
  attachments: string[]
  past_topics: { topic: string; date: string }[]
  marketing_opt_in: boolean
  plan: string
}

export default function AccountPage() {
  const [memory, setMemory] = useState<Memory | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState<'delete' | 'clear' | 'consent' | null>(null)
  const router = useRouter()

  useEffect(() => {
    let live = true
    fetch('/api/account/memory')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((m: Memory) => { if (live) setMemory(m) })
      .catch(() => { if (live) setLoadError(true) })
    return () => { live = false }
  }, [])

  async function clearMemory() {
    setBusy('clear')
    const res = await fetch('/api/account/memory', { method: 'DELETE' }).catch(() => null)
    setBusy(null)
    if (res?.ok && memory) {
      setMemory({ ...memory, life_context: null, life_stage: null, themes: [], attachments: [], past_topics: [] })
      setStatus('Done. Kanha no longer remembers anything about you from past conversations.')
    } else setStatus('Could not clear your profile. Please try again.')
  }

  async function setMarketing(on: boolean) {
    if (!memory) return
    setBusy('consent')
    const res = await fetch('/api/account/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketing: on }),
    }).catch(() => null)
    setBusy(null)
    if (res?.ok) setMemory({ ...memory, marketing_opt_in: on })
    else setStatus('Could not save your email preference.')
  }

  async function remove() {
    setBusy('delete')
    setStatus(null)
    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm }),
    }).catch(() => null)
    setBusy(null)
    if (res?.ok) router.push('/')
    else setStatus('Deletion failed. Please try again, or contact the grievance officer.')
  }

  const remembered = memory && (memory.life_context || memory.life_stage || memory.themes.length || memory.attachments.length || memory.past_topics.length)

  return (
    <main className="legal-page">
      <p><Link href="/chat">← Back to chat</Link></p>
      <h1>Your account</h1>
      {memory && <p>Plan: <strong style={{ textTransform: 'capitalize' }}>{memory.plan}</strong></p>}

      <h2>What Kanha remembers about you</h2>
      <p>Kanha keeps a short summary of past conversations so it doesn&rsquo;t ask you to repeat yourself. You can see it here and erase it at any time.</p>
      {loadError && <p role="alert" className="auth-error" style={{ textAlign: 'left' }}>Could not load your profile.</p>}
      {memory && (remembered ? (
        <dl className="memory-list">
          {memory.life_context && (<><dt>Your situation</dt><dd>{memory.life_context}</dd></>)}
          {memory.life_stage && (<><dt>Life stage</dt><dd style={{ textTransform: 'capitalize' }}>{memory.life_stage}</dd></>)}
          {memory.themes.length > 0 && (<><dt>Themes that come up</dt><dd>{memory.themes.join(', ')}</dd></>)}
          {memory.attachments.length > 0 && (<><dt>What you hold on to</dt><dd>{memory.attachments.join(', ')}</dd></>)}
          {memory.past_topics.length > 0 && (<><dt>Past conversations</dt><dd>{memory.past_topics.map((t) => t.topic).filter(Boolean).join(' · ')}</dd></>)}
        </dl>
      ) : (
        <>
          <HairlineFigure name="diyas" label="Five clay lamps on a ledge, waiting to be lit." />
          <p className="memory-empty">Nothing yet. Kanha learns from your conversations as you talk.</p>
        </>
      ))}
      {remembered ? (
        <div className="account-actions">
          <button type="button" className="btn-ghost" onClick={clearMemory} disabled={busy !== null}>
            {busy === 'clear' ? 'Clearing…' : 'Forget all of this'}
          </button>
        </div>
      ) : null}

      <h2>Emails</h2>
      {memory && (
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={memory.marketing_opt_in}
            disabled={busy !== null}
            onChange={(e) => setMarketing(e.target.checked)}
          />
          <span>Send me occasional updates. Turn this off any time; we stop immediately.</span>
        </label>
      )}

      <h2>Download your data</h2>
      <p>Everything we hold about you as one file: profile, conversations and consent history.</p>
      <div className="account-actions">
        <a className="btn-ghost" href="/api/account/export" download>Download my data</a>
      </div>

      <h2>Delete your account</h2>
      <p>This permanently deletes your account, conversations and profile. It cannot be undone. Type <strong>{PHRASE}</strong> to confirm.</p>
      <div className="account-actions">
        <label htmlFor="confirm-delete" className="sr-only">Confirmation phrase</label>
        <input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={PHRASE} autoComplete="off" />
        <button className="btn-primary btn-danger" type="button" disabled={confirm !== PHRASE || busy !== null} onClick={remove}>
          {busy === 'delete' ? 'Deleting…' : 'Permanently delete'}
        </button>
      </div>
      {status && <p role="status" style={{ marginTop: '1rem' }}>{status}</p>}

      <p style={{ marginTop: '2.5rem' }}><Link href="/privacy">Privacy Notice</Link> · <Link href="/terms">Terms</Link></p>
    </main>
  )
}
