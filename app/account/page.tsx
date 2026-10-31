'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const PHRASE = 'DELETE MY ACCOUNT'

export default function AccountPage() {
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function remove() {
    setBusy(true)
    setStatus(null)
    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm }),
    }).catch(() => null)
    setBusy(false)
    if (res?.ok) router.push('/')
    else setStatus('Deletion failed. Please try again, or contact the grievance officer.')
  }

  return (
    <main className="legal-page">
      <h1>Your account</h1>
      <p><Link href="/chat">← Back to chat</Link></p>

      <h2>Download your data</h2>
      <p>Download everything we hold about you as a single file: your profile, conversations and consent history.</p>
      <div className="account-actions">
        <a className="btn-ghost" href="/api/account/export" download>Download my data</a>
      </div>

      <h2>Delete your account</h2>
      <p>This permanently deletes your account, conversations and profile. It cannot be undone. Type <strong>{PHRASE}</strong> to confirm.</p>
      <div className="account-actions">
        <label htmlFor="confirm-delete" className="sr-only">Confirmation phrase</label>
        <input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={PHRASE} autoComplete="off" />
        <button className="btn-primary btn-danger" type="button" disabled={confirm !== PHRASE || busy} onClick={remove}>
          {busy ? 'Deleting…' : 'Permanently delete'}
        </button>
        {status && <p role="alert">{status}</p>}
      </div>

      <p style={{ marginTop: '2rem' }}><Link href="/privacy">Privacy Notice</Link> · <Link href="/terms">Terms</Link></p>
    </main>
  )
}
