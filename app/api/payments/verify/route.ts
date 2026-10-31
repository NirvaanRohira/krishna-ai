import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isRazorpayId, verifyCheckoutSignature } from '@/lib/payments/razorpay'
import { settlePayment } from '@/lib/payments/settle'
import { log } from '@/lib/log'

// Step 3 of checkout: the browser hands back what Razorpay gave it. We check the signature,
// check the order belongs to this user, confirm the payment with Razorpay, then grant the
// plan. The webhook does the same thing independently, so closing the tab can't lose a payment.
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const orderId = body?.razorpay_order_id
  const paymentId = body?.razorpay_payment_id
  const signature = body?.razorpay_signature
  if (!isRazorpayId(orderId, 'order_') || !isRazorpayId(paymentId, 'pay_') || typeof signature !== 'string') {
    return NextResponse.json({ error: 'Missing payment details.' }, { status: 400 })
  }
  if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
    log.warn('payments', 'checkout signature mismatch', { userId: user.id, orderId })
    return NextResponse.json({ error: 'We could not verify this payment.' }, { status: 400 })
  }

  // The order must be one this user created (RLS: users can only read their own rows).
  const { data: mine } = await supabase.from('payments').select('order_id').eq('order_id', orderId).maybeSingle()
  if (!mine) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Payments are not available right now.' }, { status: 503 })

  try {
    const result = await settlePayment(admin, orderId, paymentId)
    if (!result.ok) {
      log.warn('payments', 'payment not applied', { userId: user.id, orderId, reason: result.reason })
      return NextResponse.json({ error: 'This payment could not be applied. If money was taken, it will be refunded automatically or contact us.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true, plan: result.plan, validUntil: result.validUntil })
  } catch (err) {
    log.error('payments', 'verify failed', { userId: user.id, orderId }, err)
    // Money may have moved: the webhook will still apply it. Tell the user honestly.
    return NextResponse.json({ error: 'Your payment is being confirmed. Your plan will update within a few minutes.' }, { status: 202 })
  }
}
