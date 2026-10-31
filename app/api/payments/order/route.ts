import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, rateLimitKey } from '@/lib/rateLimit'
import { findProduct } from '@/lib/payments/catalog'
import { createOrder, razorpayConfigured, RazorpayError } from '@/lib/payments/razorpay'
import { log } from '@/lib/log'

// Step 1 of checkout: create a Razorpay order for a product, priced on the server.
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })

  const { allowed, retryAfterSec } = checkRateLimit(`pay:${rateLimitKey(req, user.id)}`, { limit: 10, windowMs: 60_000 })
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } })
  }

  const body = await req.json().catch(() => ({}))
  const product = findProduct(body?.product)
  if (!product) return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 })

  const admin = createAdminClient()
  if (!razorpayConfigured() || !admin) {
    return NextResponse.json({ error: 'Payments are not available right now.' }, { status: 503 })
  }

  try {
    const order = await createOrder({
      amountPaise: product.amountPaise,
      receipt: `${product.id}_${Date.now().toString(36)}`,
      notes: { user_id: user.id, product: product.id },
    })
    if (order.amount !== product.amountPaise) throw new Error('order amount mismatch')

    // Remember what this order buys. Only the server writes this row (users can only read it).
    const { error } = await admin.from('payments').insert({
      order_id: order.id,
      user_id: user.id,
      sku: product.id,
      plan: product.plan,
      days: product.days,
      amount_paise: product.amountPaise,
    })
    if (error) throw error

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // public by design; the secret never leaves the server
      label: product.label,
      email: user.email ?? undefined,
    })
  } catch (err) {
    const status = err instanceof RazorpayError && err.status === 401 ? 'auth' : 'error'
    log.error('payments', 'order creation failed', { userId: user.id, product: product.id, status }, err)
    return NextResponse.json({ error: 'Could not start the payment. Please try again.' }, { status: 502 })
  }
}
