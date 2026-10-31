'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PRODUCTS, rupees } from '@/lib/payments/catalog'

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

const PLANS = [
  {
    plan: 'free', name: 'Free', blurb: 'To begin.',
    features: ['10 messages a day', 'About 5 spoken replies a day', 'English and Hindi'],
  },
  {
    plan: 'plus', name: 'Plus', blurb: 'For a daily practice.',
    features: ['40 messages a day', 'About 20 spoken replies a day', 'All Indian languages', 'Long-term memory'],
  },
  {
    plan: 'premium', name: 'Premium', blurb: 'For deep study.',
    features: ['150 messages a day', 'About 80 spoken replies a day', 'The most natural (HD) voice', 'Everything in Plus'],
  },
] as const

export default function PricingPage() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

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
      if (!res.ok) { setStatus({ kind: 'error', text: order.error ?? 'Could not start the payment.' }); return }
      if (!(await loadCheckout()) || !window.Razorpay) {
        setStatus({ kind: 'error', text: 'Could not load the payment window. Check your connection and try again.' })
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
            const until = data.validUntil ? ` until ${new Date(data.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''
            setStatus({ kind: 'ok', text: `Thank you. You're on ${data.plan === 'premium' ? 'Premium' : 'Plus'}${until}.` })
          } else {
            setStatus({ kind: v?.status === 202 ? 'ok' : 'error', text: data.error ?? 'Your payment is being confirmed. Your plan will update within a few minutes.' })
          }
        },
        modal: { ondismiss: () => { setBusy(null); setStatus({ kind: 'error', text: 'Payment cancelled. You have not been charged.' }) } },
      })
      rzp.on('payment.failed', (r) => {
        setBusy(null)
        setStatus({ kind: 'error', text: r.error?.description ? `Payment failed: ${r.error.description}` : 'Payment failed. You have not been charged.' })
      })
      rzp.open()
      setBusy(null)
    } catch {
      setStatus({ kind: 'error', text: 'Could not start the payment. Please try again.' })
    } finally {
      setBusy((b) => (b === productId ? null : b))
    }
  }

  return (
    <main className="legal-page pricing-page">
      <p><Link href="/chat">← Back to chat</Link></p>
      <h1>Plans</h1>
      <p>Kanha is an AI guide to the Gita, shown in Krishna&rsquo;s likeness. It is not God and not Krishna. Every conversation costs us real compute, so free use is capped.</p>
      <p><strong>No auto-renewal.</strong> You pay once for 30 days or a year. Nothing is charged again unless you choose to buy again, and buying again adds to your remaining time.</p>

      {status && (
        <p role={status.kind === 'error' ? 'alert' : 'status'} className={status.kind === 'error' ? 'auth-error pricing-status' : 'pricing-status pricing-status-ok'}>
          {status.text}
        </p>
      )}

      <div className="plan-grid">
        {PLANS.map((p) => {
          const products = PRODUCTS.filter((x) => x.plan === p.plan)
          return (
            <section key={p.plan} className={`plan-card${p.plan === 'plus' ? ' plan-card-featured' : ''}`} aria-labelledby={`plan-${p.plan}`}>
              <h2 id={`plan-${p.plan}`}>{p.name}</h2>
              <p className="plan-blurb">{p.blurb}</p>
              <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
              {products.length === 0 ? (
                <p className="plan-price">{rupees(0)}</p>
              ) : products.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={x.days >= 365 ? 'btn-ghost' : 'btn-primary'}
                  disabled={busy !== null}
                  onClick={() => buy(x.id)}
                >
                  {busy === x.id ? 'Opening…' : `${rupees(x.amountPaise)} · ${x.days >= 365 ? '1 year' : '30 days'}`}
                </button>
              ))}
            </section>
          )
        })}
      </div>

      <h2>Good to know</h2>
      <ul>
        <li>Prices are in Indian rupees and include any applicable taxes.</li>
        <li>Payments are processed by Razorpay (UPI, cards, net banking, wallets). We never see your card details.</li>
        <li>Refunds: see the <Link href="/terms">terms</Link>. Write to us within 7 days if something went wrong.</li>
      </ul>
    </main>
  )
}
