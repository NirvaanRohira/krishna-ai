'use client'
// "Report this reply": Google Play requires an in-app way to report offensive AI output, and the
// website has the same. A person reviews every report (table reply_reports, service role only).

import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/components/LangProvider'
import type { MessageKey } from '@/lib/i18n'

const REASONS: { value: string; key: MessageKey }[] = [
  { value: 'harmful', key: 'report.harmful' },
  { value: 'offensive', key: 'report.offensive' },
  { value: 'wrong', key: 'report.wrong' },
  { value: 'other', key: 'report.other' },
]

type Props = { reply: string; sessionId: string | null; onClose: () => void }

export function ReportDialog({ reply, sessionId, onClose }: Props) {
  const { t } = useLang()
  const ref = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal?.()
  }, [])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason || state === 'sending') return
    setState('sending')
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, reason, reply, note, source: 'web' }),
      })
      setState(res.ok ? 'sent' : 'failed')
    } catch {
      setState('failed')
    }
  }

  return (
    <dialog ref={ref} className="report-dialog" aria-labelledby="report-title" onClose={onClose} onCancel={onClose}>
      {state === 'sent' ? (
        <div className="report-dialog__body">
          <p role="status">{t('report.thanks')}</p>
          <div className="report-dialog__actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>OK</button>
          </div>
        </div>
      ) : (
        <form className="report-dialog__body" onSubmit={send}>
          <h2 id="report-title" className="report-dialog__title">{t('report.title')}</h2>
          <p className="report-dialog__intro">{t('report.intro')}</p>
          <fieldset className="report-dialog__reasons">
            <legend className="sr-only">{t('report.title')}</legend>
            {REASONS.map((r) => (
              <label key={r.value}>
                <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                <span>{t(r.key)}</span>
              </label>
            ))}
          </fieldset>
          <label className="report-dialog__note">
            <span>{t('report.note')}</span>
            <textarea value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} />
          </label>
          {state === 'failed' && <p className="report-dialog__error" role="alert">{t('report.failed')}</p>}
          <div className="report-dialog__actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('report.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={!reason || state === 'sending'}>{t('report.send')}</button>
          </div>
        </form>
      )}
    </dialog>
  )
}
