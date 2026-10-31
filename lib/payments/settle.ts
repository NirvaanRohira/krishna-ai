import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { capturePayment, fetchPayment, type RzpPayment } from './razorpay'

export type SettleResult =
  | { ok: true; plan: string; validUntil: string | null; already?: boolean }
  | { ok: false; reason: string }

/**
 * Turn a Razorpay payment into a plan, exactly once.
 * `known` is a payment entity we already trust (from a signature-verified webhook);
 * otherwise the payment is fetched from Razorpay with our secret key, so a browser can
 * never claim a payment that didn't happen.
 */
export async function settlePayment(
  admin: SupabaseClient,
  orderId: string,
  paymentId: string,
  known?: RzpPayment,
): Promise<SettleResult> {
  let payment = known ?? (await fetchPayment(paymentId))
  if (payment.id !== paymentId || payment.order_id !== orderId) return { ok: false, reason: 'payment_order_mismatch' }
  if (payment.currency !== 'INR') return { ok: false, reason: 'currency' }

  // Accounts set to manual capture leave payments "authorized"; capture them here.
  if (payment.status === 'authorized') payment = await capturePayment(paymentId, payment.amount)
  if (payment.status !== 'captured') return { ok: false, reason: `status_${payment.status}` }

  const { data, error } = await admin.rpc('apply_payment', {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_amount_paise: payment.amount,
  })
  if (error || !data) throw error ?? new Error('apply_payment returned nothing')
  const r = data as { ok: boolean; reason?: string; plan?: string; valid_until?: string | null; already?: boolean }
  if (!r.ok) return { ok: false, reason: r.reason ?? 'rejected' }
  return { ok: true, plan: r.plan ?? 'free', validUntil: r.valid_until ?? null, already: r.already }
}
