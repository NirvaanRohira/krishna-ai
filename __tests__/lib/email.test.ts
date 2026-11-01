import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('sendEmail (Resend)', () => {
  it('skips quietly when email is not configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { sendEmail } = await import('@/lib/email/send')
    expect(await sendEmail({ to: 'a@x.in', subject: 's', html: '<p>h</p>', text: 't' })).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends with the API key in a header and an idempotency key', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('EMAIL_FROM', 'Kanha <hello@kanha.app>')
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"1"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { sendEmail } = await import('@/lib/email/send')
    expect(await sendEmail({ to: 'a@x.in', subject: 's', html: 'h', text: 't', idempotencyKey: 'receipt-pay_1' })).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_test')
    expect(init.headers['Idempotency-Key']).toBe('receipt-pay_1')
    expect(JSON.parse(init.body)).toMatchObject({ from: 'Kanha <hello@kanha.app>', to: ['a@x.in'] })
  })

  it('never throws when Resend fails', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('EMAIL_FROM', 'x@kanha.app')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const { sendEmail } = await import('@/lib/email/send')
    await expect(sendEmail({ to: 'a@x.in', subject: 's', html: 'h', text: 't' })).resolves.toBe(false)
  })
})

describe('email templates', () => {
  it('receipt states plan, amount, end date, no auto-renewal and the AI disclosure; escapes HTML', async () => {
    const { purchaseEmail } = await import('@/lib/email/templates')
    const m = purchaseEmail({ plan: 'premium', days: 30, amountPaise: 49900, validUntil: '2026-12-01T08:15:55Z', paymentId: 'pay_<x>' })
    expect(m.subject).toContain('Premium')
    expect(m.text).toContain('₹499')
    expect(m.text).toContain('1 December 2026')
    expect(m.text).toMatch(/Nothing renews automatically/)
    expect(m.html).toContain('not God, not Krishna')
    expect(m.html).not.toContain('pay_<x>')
    expect(m.html).toContain('pay_&lt;x&gt;')
  })
})

describe('expiry reminders', () => {
  it('emails each pass ending in 2-3 days once, keyed so a re-run cannot double-send', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('EMAIL_FROM', 'x@kanha.app')
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const until = new Date(Date.now() + 2.5 * 86_400_000).toISOString()
    const q: Record<string, unknown> = {}
    for (const k of ['select', 'eq', 'gte', 'lt']) q[k] = () => q
    q.limit = async () => ({ data: [{ user_id: 'u1', plan: 'plus', valid_until: until }], error: null })
    const admin = {
      from: () => q,
      auth: { admin: { getUserById: async () => ({ data: { user: { email: 'u1@x.in' } } }) } },
    }
    const { sendExpiryReminders } = await import('@/app/api/cron/route')
    expect(await sendExpiryReminders(admin as never)).toEqual({ due: 1, sent: 1 })
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe(`expiry-u1-${until}`)
  })
})
