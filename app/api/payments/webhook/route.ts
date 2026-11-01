import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isRazorpayId, verifyWebhookSignature, type RzpPayment } from '@/lib/payments/razorpay'
import { settlePayment } from '@/lib/payments/settle'
import { log } from '@/lib/log'

// Razorpay → us. Set up in Dashboard → Account & Settings → Webhooks:
//   URL      https://<your-domain>/api/payments/webhook
//   Secret   the value of RAZORPAY_WEBHOOK_SECRET
//   Events   payment.captured, order.paid, payment.failed, refund.processed
//
// Rules: verify the signature over the raw body, ignore events we've already handled
// (Razorpay retries), and keep every handler idempotent (events can arrive out of order).

type Event = {
  event?: string
  payload?: {
    payment?: { entity?: RzpPayment }
    refund?: { entity?: { payment_id?: string; amount?: number } }
  }
}

export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature'))) {
    // Usually a webhook secret mismatch, or a webhook created in the other mode (test vs live).
    log.warn('payments', 'webhook signature rejected', { hasSignature: Boolean(req.headers.get('x-razorpay-signature')), secretSet: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET) })
    return NextResponse.json({ error: 'bad signature' }, { status: 400 })
  }
  let evt: Event
  try { evt = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }) }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'unavailable' }, { status: 503 }) // Razorpay retries

  const eventId = req.headers.get('x-razorpay-event-id')
  const name = evt.event ?? 'unknown'
  if (eventId) {
    // First writer wins; a duplicate delivery hits the primary key and is skipped.
    const { error } = await admin.from('payment_events').insert({ event_id: eventId.slice(0, 64), event: name.slice(0, 64) })
    if (error) {
      if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
      log.error('payments', 'webhook dedupe insert failed', { name }, error)
      return NextResponse.json({ error: 'retry' }, { status: 500 })
    }
  }

  try {
    const payment = evt.payload?.payment?.entity
    if ((name === 'payment.captured' || name === 'order.paid') && payment && isRazorpayId(payment.id, 'pay_') && isRazorpayId(payment.order_id, 'order_')) {
      const r = await settlePayment(admin, payment.order_id, payment.id, payment)
      if (!r.ok) log.warn('payments', 'webhook payment not applied', { name, orderId: payment.order_id, reason: r.reason })
    } else if (name === 'payment.failed' && payment && isRazorpayId(payment.order_id, 'order_')) {
      await admin.rpc('mark_payment_failed', { p_order_id: payment.order_id })
    } else if (name === 'refund.processed') {
      const paymentId = evt.payload?.refund?.entity?.payment_id
      if (isRazorpayId(paymentId, 'pay_')) await admin.rpc('refund_payment', { p_payment_id: paymentId })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    log.error('payments', 'webhook handling failed', { name }, err)
    // Let Razorpay retry: forget this delivery so the retry isn't treated as a duplicate.
    if (eventId) await admin.from('payment_events').delete().eq('event_id', eventId.slice(0, 64))
    return NextResponse.json({ error: 'retry' }, { status: 500 })
  }
}
