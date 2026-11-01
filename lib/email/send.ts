import 'server-only'
import { fetchWithTimeout } from '@/lib/retry'
import { log } from '@/lib/log'

// Transactional email through Resend (https://resend.com), plain REST, no SDK.
// Needs RESEND_API_KEY and EMAIL_FROM (an address on a domain verified in Resend, e.g.
// "Kanha <hello@kanha.app>"). Without them every send is skipped and logged, so the app
// works the same before email is set up. Transactional mail only (receipts, reminders):
// marketing email needs the separate opt-in recorded in the consent ledger.

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export type Email = { to: string; subject: string; html: string; text: string; idempotencyKey?: string }

/** Sends one email. Never throws: email must not break a payment or a cron run. */
export async function sendEmail(mail: Email): Promise<boolean> {
  if (!emailConfigured()) {
    log.info('email', 'skipped (email not configured)', { subject: mail.subject })
    return false
  }
  try {
    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Resend drops a repeat with the same key, so a retried webhook can't double-send.
        ...(mail.idempotencyKey ? { 'Idempotency-Key': mail.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
      }),
    })
    if (!res.ok) {
      log.error('email', 'send failed', { status: res.status, subject: mail.subject })
      return false
    }
    return true
  } catch (err) {
    log.error('email', 'send failed', { subject: mail.subject }, err)
    return false
  }
}
