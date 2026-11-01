// Plain, warm, and honest about what was bought. Every email repeats the AI disclosure.
const APP = () => process.env.NEXT_PUBLIC_APP_URL || 'https://kanhacall.vercel.app'
const SUPPORT = () => process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || process.env.EMAIL_REPLY_TO || ''

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const date = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
const PLAN = (p: string) => ({ plus: 'Plus', premium: 'Premium' } as Record<string, string>)[p] ?? p

function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#fbf6ec;font-family:Georgia,serif;color:#1d1838">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-size:28px;margin:0 0 4px">Kanha</p>
<h1 style="font-size:20px;font-weight:normal;margin:16px 0">${esc(title)}</h1>
<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#47405f">${bodyHtml}</div>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#6a6380;margin-top:32px">Kanha is an AI drawing on the Sanskrit texts. It is not God, not Krishna, and not a spiritual authority.${SUPPORT() ? ` Questions or a refund: ${esc(SUPPORT())}.` : ''}</p>
</div></body></html>`
}

export function purchaseEmail(p: { plan: string; days: number; amountPaise: number; validUntil: string | null; paymentId: string }) {
  const amount = `₹${(p.amountPaise / 100).toLocaleString('en-IN')}`
  const until = p.validUntil ? date(p.validUntil) : null
  const subject = `Thank you. You're on Kanha ${PLAN(p.plan)}`
  const lines = [
    `Thank you for your support. Your ${PLAN(p.plan)} pass (${p.days === 365 ? '1 year' : `${p.days} days`}) is active${until ? ` until ${until}` : ''}.`,
    `Amount paid: ${amount}. Payment reference: ${p.paymentId}.`,
    'Nothing renews automatically. If you want to continue after it ends, you can buy again from the Plans page, and the new days are added to any time you have left.',
    'If something went wrong, write to us within 7 days and we will refund you.',
  ]
  return {
    subject,
    text: `${lines.join('\n\n')}\n\nOpen Kanha: ${APP()}/chat`,
    html: wrap(subject, lines.map((l) => `<p>${esc(l)}</p>`).join('') + `<p><a href="${APP()}/chat" style="color:#8f5300">Open Kanha</a></p>`),
  }
}

export function expiryReminderEmail(p: { plan: string; validUntil: string }) {
  const subject = `Your Kanha ${PLAN(p.plan)} pass ends on ${date(p.validUntil)}`
  const lines = [
    `Your ${PLAN(p.plan)} pass ends on ${date(p.validUntil)}. After that you'll be on the free plan, and your conversations and what Kanha remembers stay as they are.`,
    'Nothing will be charged. If you would like to continue, you can extend from the Plans page.',
  ]
  return {
    subject,
    text: `${lines.join('\n\n')}\n\nPlans: ${APP()}/pricing`,
    html: wrap(subject, lines.map((l) => `<p>${esc(l)}</p>`).join('') + `<p><a href="${APP()}/pricing" style="color:#8f5300">See plans</a></p>`),
  }
}
