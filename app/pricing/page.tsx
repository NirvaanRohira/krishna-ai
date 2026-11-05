'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PRODUCTS, rupees } from '@/lib/payments/catalog'
import { usePlan } from '@/hooks/usePlan'
import { useLang } from '@/components/LangProvider'
import { formatDate, type MessageKey } from '@/lib/i18n'

// Razorpay Standard Checkout. checkout.js is loaded only when someone taps "Buy", so the
// rest of the site never loads third-party payment code.
type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void }
declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance }
}

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

const PLANS: { plan: 'free' | 'plus' | 'premium'; name: MessageKey; blurb: MessageKey; features: MessageKey[] }[] = [
  { plan: 'free', name: 'plan.free', blurb: 'pricing.free_blurb', features: ['pricing.f_free_1', 'pricing.f_free_2', 'pricing.f_free_3'] },
  { plan: 'plus', name: 'plan.plus', blurb: 'pricing.plus_blurb', features: ['pricing.f_plus_1', 'pricing.f_plus_2', 'pricing.f_plus_3', 'pricing.f_plus_4'] },
  { plan: 'premium', name: 'plan.premium', blurb: 'pricing.premium_blurb', features: ['pricing.f_premium_1', 'pricing.f_premium_2', 'pricing.f_premium_3', 'pricing.f_premium_4'] },
]
const PLAN_KEY: Record<string, MessageKey> = { free: 'plan.free', plus: 'plan.plus', premium: 'plan.premium' }

export default function PricingPage() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const current = usePlan()
  const { lang, t } = useLang()
  const planName = (p: string) => (PLAN_KEY[p] ? t(PLAN_KEY[p]) : p)
  const RANK: Record<string, number> = { free: 0, plus: 1, premium: 2 }
  const currentRank = RANK[current.plan] ?? 0

  async function buy(productId: string) {
    setStatus(null)
    setBusy(productId)
    try {
      const res = await fetch('/api/payments/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: productId }),
      })
      if (res.status === 401) { router.push('/login'); return }
      const order = await res.json().catch(() => ({}))
      if (!res.ok) { setStatus({ kind: 'error', text: order.error ?? t('pricing.could_not_start') }); return }
      if (!(await loadCheckout()) || !window.Razorpay) {
        setStatus({ kind: 'error', text: t('pricing.could_not_load') })
        return
      }

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'Kanha',
        description: order.label,
        prefill: order.email ? { email: order.email } : undefined,
        theme: { color: '#e9bb62' },
        handler: async (r: RazorpayResponse) => {
          setBusy(productId)
          const v = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(r),
          }).catch(() => null)
          const data = v ? await v.json().catch(() => ({})) : {}
          setBusy(null)
          if (v?.ok && data.ok) {
            current.refresh()
            const until = data.validUntil ? ` ${t('pricing.until', { date: formatDate(lang, data.validUntil) })}` : ''
            setStatus({ kind: 'ok', text: t('pricing.thanks', { plan: planName(data.plan === 'premium' ? 'premium' : 'plus'), until }) })
          } else {
            setStatus({ kind: v?.status === 202 ? 'ok' : 'error', text: data.error ?? t('pricing.confirming') })
          }
        },
        modal: { ondismiss: () => { setBusy(null); setStatus({ kind: 'error', text: t('pricing.cancelled') }) } },
      })
      rzp.on('payment.failed', (r) => {
        setBusy(null)
        setStatus({ kind: 'error', text: r.error?.description ? t('pricing.failed_reason', { reason: r.error.description }) : t('pricing.failed') })
      })
      rzp.open()
      setBusy(null)
    } catch {
      setStatus({ kind: 'error', text: t('pricing.could_not_start') })
    } finally {
      setBusy((b) => (b === productId ? null : b))
    }
  }

  return (
    <main className="legal-page pricing-page">
      <p><Link href="/chat">{t('common.back_to_chat')}</Link></p>
      <h1>{t('pricing.title')}</h1>
      <p>{t('pricing.intro')}</p>
      <p><strong>{t('pricing.no_renewal_strong')}</strong> {t('pricing.no_renewal')}</p>

      {current.loaded && current.plan !== 'free' && (
        <p className="pricing-current">
          {t('pricing.current', { plan: planName(current.plan), until: current.validUntil ? ` ${t('pricing.until', { date: formatDate(lang, current.validUntil) })}` : '' })}
        </p>
      )}

      {status && (
        <p role={status.kind === 'error' ? 'alert' : 'status'} className={status.kind === 'error' ? 'auth-error pricing-status' : 'pricing-status pricing-status-ok'}>
          {status.text}
        </p>
      )}

      <div className="plan-grid">
        {PLANS.map((p) => {
          const products = PRODUCTS.filter((x) => x.plan === p.plan)
          const isCurrent = current.loaded && current.plan === p.plan
          // A lower plan is already included while a higher one is active.
          const included = current.loaded && (RANK[p.plan] ?? 0) < currentRank
          const featured = current.plan === 'free' ? p.plan === 'plus' : isCurrent
          return (
            <section key={p.plan} className={`plan-card${featured ? ' plan-card-featured' : ''}`} aria-labelledby={`plan-${p.plan}`}>
              {isCurrent && <span className="plan-badge">{t('pricing.your_plan')}</span>}
              <h2 id={`plan-${p.plan}`}>{t(p.name)}</h2>
              <p className="plan-blurb">{t(p.blurb)}</p>
              <ul>{p.features.map((f) => <li key={f}>{t(f)}</li>)}</ul>
              {products.length === 0 ? (
                <p className="plan-price">{rupees(0)}</p>
              ) : included ? (
                <p className="plan-price plan-included">{t('pricing.included', { plan: planName(current.plan) })}</p>
              ) : products.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={x.days >= 365 ? 'btn-ghost' : 'btn-primary'}
                  disabled={busy !== null}
                  onClick={() => buy(x.id)}
                >
                  {busy === x.id ? t('pricing.opening') : `${isCurrent ? `${t('pricing.extend')} · ` : ''}${rupees(x.amountPaise)} · ${x.days >= 365 ? t('pricing.year') : t('pricing.days30')}`}
                </button>
              ))}
            </section>
          )
        })}
      </div>

      <h2>{t('pricing.good_to_know')}</h2>
      <ul>
        <li>{t('pricing.gtk_1')}</li>
        <li>{t('pricing.gtk_2')}</li>
        <li>{t('pricing.gtk_3a')} <Link href="/terms">{t('pricing.terms_link')}</Link>{t('pricing.gtk_3b')}</li>
      </ul>
    </main>
  )
}
