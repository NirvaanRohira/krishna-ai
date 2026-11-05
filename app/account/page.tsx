'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HairlineFigure } from '@/components/HairlineFigure'
import { DailyVerseToggle } from '@/components/DailyVerseToggle'
import { InstallButton } from '@/components/InstallButton'
import { useLang } from '@/components/LangProvider'
import { formatDate } from '@/lib/i18n'

const PHRASE = 'DELETE MY ACCOUNT'

type Memory = {
  life_context: string | null
  life_stage: string | null
  themes: string[]
  attachments: string[]
  past_topics: { topic: string; date: string }[]
  marketing_opt_in: boolean
  plan: string
  plan_until: string | null
}

export default function AccountPage() {
  const { lang, t } = useLang()
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
      setStatus(t('account.cleared'))
    } else setStatus(t('account.clear_failed'))
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
    else setStatus(t('account.email_failed'))
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
    else setStatus(t('account.delete_failed'))
  }

  const remembered = memory && (memory.life_context || memory.life_stage || memory.themes.length || memory.attachments.length || memory.past_topics.length)

  return (
    <main className="legal-page">
      <p><Link href="/chat">{t('common.back_to_chat')}</Link></p>
      <h1>{t('account.title')}</h1>
      {memory && (
        <p>
          {t('account.plan')}: <strong>{t(memory.plan === 'premium' ? 'plan.premium' : memory.plan === 'plus' ? 'plan.plus' : 'plan.free')}</strong>
          {memory.plan_until && <> · {t('pricing.until', { date: formatDate(lang, memory.plan_until) })}</>}
          {' · '}<Link href="/pricing">{memory.plan === 'free' ? t('account.see_plans') : t('account.extend')}</Link>
        </p>
      )}

      <h2>{t('account.memory_title')}</h2>
      <p>{t('account.memory_intro')}</p>
      {loadError && <p role="alert" className="auth-error" style={{ textAlign: 'left' }}>{t('account.load_failed')}</p>}
      {memory && (remembered ? (
        <dl className="memory-list">
          {memory.life_context && (<><dt>{t('account.situation')}</dt><dd>{memory.life_context}</dd></>)}
          {memory.life_stage && (<><dt>{t('account.life_stage')}</dt><dd style={{ textTransform: 'capitalize' }}>{memory.life_stage}</dd></>)}
          {memory.themes.length > 0 && (<><dt>{t('account.themes')}</dt><dd>{memory.themes.join(', ')}</dd></>)}
          {memory.attachments.length > 0 && (<><dt>{t('account.attachments')}</dt><dd>{memory.attachments.join(', ')}</dd></>)}
          {memory.past_topics.length > 0 && (<><dt>{t('account.past')}</dt><dd>{memory.past_topics.map((t) => t.topic).filter(Boolean).join(' · ')}</dd></>)}
        </dl>
      ) : (
        <>
          <HairlineFigure name="diyas" label={t('account.lamps')} />
          <p className="memory-empty">{t('account.nothing')}</p>
        </>
      ))}
      {remembered ? (
        <div className="account-actions">
          <button type="button" className="btn-ghost" onClick={clearMemory} disabled={busy !== null}>
            {busy === 'clear' ? t('account.clearing') : t('account.forget')}
          </button>
        </div>
      ) : null}

      <h2>{t('account.morning_title')}</h2>
      <p>{t('account.morning_body')} <Link href="/verse">{t('account.see_today')}</Link>.</p>
      <DailyVerseToggle />
      <InstallButton />

      <h2>{t('account.emails_title')}</h2>
      {memory && (
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={memory.marketing_opt_in}
            disabled={busy !== null}
            onChange={(e) => setMarketing(e.target.checked)}
          />
          <span>{t('account.emails_opt')}</span>
        </label>
      )}

      <h2>{t('account.download_title')}</h2>
      <p>{t('account.download_body')}</p>
      <div className="account-actions">
        <a className="btn-ghost" href="/api/account/export" download>{t('account.download')}</a>
      </div>

      <h2>{t('account.delete_title')}</h2>
      <p>{t('account.delete_body', { phrase: PHRASE })}</p>
      <div className="account-actions">
        <label htmlFor="confirm-delete" className="sr-only">{t('account.confirm_label')}</label>
        <input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={PHRASE} autoComplete="off" />
        <button className="btn-primary btn-danger" type="button" disabled={confirm !== PHRASE || busy !== null} onClick={remove}>
          {busy === 'delete' ? t('account.deleting') : t('account.delete')}
        </button>
      </div>
      {status && <p role="status" style={{ marginTop: '1rem' }}>{status}</p>}

      <p style={{ marginTop: '2.5rem' }}><Link href="/privacy">{t('common.privacy_notice')}</Link> · <Link href="/terms">{t('common.terms')}</Link></p>
    </main>
  )
}
