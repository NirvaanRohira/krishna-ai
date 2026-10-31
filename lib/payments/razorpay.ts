import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { fetchWithTimeout } from '@/lib/retry'

// Minimal Razorpay REST client (no SDK needed: three endpoints and two signatures).
// Docs: https://razorpay.com/docs/api/  ·  Keys: Dashboard → Account & Settings → API Keys.

const API = 'https://api.razorpay.com/v1'

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

export class RazorpayError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')
  const res = await fetchWithTimeout(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) throw new RazorpayError(res.status, `Razorpay ${method} ${path.split('/')[1]} ${res.status}`)
  return (await res.json()) as T
}

export type RzpOrder = { id: string; amount: number; currency: string; receipt?: string; status: string }
export type RzpPayment = { id: string; order_id: string | null; amount: number; currency: string; status: string }

export function createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
  return call<RzpOrder>('POST', '/orders', {
    amount: input.amountPaise,
    currency: 'INR',
    receipt: input.receipt,
    notes: input.notes,
  })
}

export function fetchPayment(paymentId: string) {
  return call<RzpPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`)
}

export function capturePayment(paymentId: string, amountPaise: number) {
  return call<RzpPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' })
}

function safeEqualHex(expected: string, given: unknown): boolean {
  if (typeof given !== 'string' || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given))
}

/** Checkout signature: HMAC-SHA256(order_id + "|" + payment_id, key secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: unknown): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
  return safeEqualHex(expected, signature)
}

/** Webhook signature: HMAC-SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: unknown): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqualHex(expected, signature)
}

/** Razorpay ids are short and alphanumeric: reject anything else before using them. */
export function isRazorpayId(v: unknown, prefix: 'order_' | 'pay_'): v is string {
  return typeof v === 'string' && v.startsWith(prefix) && /^[A-Za-z0-9_]{8,40}$/.test(v)
}
