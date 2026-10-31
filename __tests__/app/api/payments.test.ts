import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))

const KEY_ID = 'rzp_test_abc123'
const KEY_SECRET = 'test-secret-xyz'
const WEBHOOK_SECRET = 'webhook-secret-123'
const USER = { id: 'user-pay-1', email: 'u@x.in' }

const insert = vi.fn()
const del = vi.fn()
const rpc = vi.fn()
const admin = {
  from: vi.fn(() => ({ insert, delete: () => ({ eq: del }) })),
  rpc,
}

function userClient(opts: { user?: object | null; ownsOrder?: boolean } = {}) {
  const ownsOrder = opts.ownsOrder ?? true
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: opts.user === undefined ? USER : opts.user } }) },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ownsOrder ? { order_id: 'order_TEST1234' } : null }) }) }),
    })),
  }
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const sign = (s: string, secret: string) => createHmac('sha256', secret).update(s).digest('hex')

beforeEach(async () => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.stubEnv('RAZORPAY_KEY_ID', KEY_ID)
  vi.stubEnv('RAZORPAY_KEY_SECRET', KEY_SECRET)
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', WEBHOOK_SECRET)
  insert.mockResolvedValue({ error: null })
  del.mockResolvedValue({ error: null })
  rpc.mockResolvedValue({ data: { ok: true, plan: 'plus', valid_until: '2026-12-01T00:00:00Z' }, error: null })
  const s = await import('@/lib/supabase-server')
  vi.mocked(s.createServerSupabaseClient).mockResolvedValue(userClient() as never)
  const a = await import('@/lib/supabase-admin')
  vi.mocked(a.createAdminClient).mockReturnValue(admin as never)
  const { __resetRateLimitStore } = await import('@/lib/rateLimit')
  __resetRateLimitStore()
})

describe('POST /api/payments/order', () => {
  it('requires sign-in', async () => {
    const s = await import('@/lib/supabase-server')
    vi.mocked(s.createServerSupabaseClient).mockResolvedValue(userClient({ user: null }) as never)
    const { POST } = await import('@/app/api/payments/order/route')
    expect((await POST(post('/api/payments/order', { product: 'plus_30' }))).status).toBe(401)
  })

  it('rejects unknown products and ignores any client-sent amount', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { POST } = await import('@/app/api/payments/order/route')
    expect((await POST(post('/api/payments/order', { product: 'premium_forever', amount: 100 }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates the order at the server price and records what it buys', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'order_TEST1234', amount: 19900, currency: 'INR', status: 'created' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { POST } = await import('@/app/api/payments/order/route')
    const res = await POST(post('/api/payments/order', { product: 'plus_30', amount: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ orderId: 'order_TEST1234', amount: 19900, keyId: KEY_ID })
    expect(JSON.stringify(body)).not.toContain(KEY_SECRET)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.razorpay.com/v1/orders')
    expect(JSON.parse(init.body)).toMatchObject({ amount: 19900, currency: 'INR', notes: { user_id: USER.id, product: 'plus_30' } })
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: 'order_TEST1234', user_id: USER.id, plan: 'plus', days: 30, amount_paise: 19900 }))
  })

  it('does not leak Razorpay errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"description":"Authentication failed"}}', { status: 401 })))
    const { POST } = await import('@/app/api/payments/order/route')
    const res = await POST(post('/api/payments/order', { product: 'plus_30' }))
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toMatch(/Authentication|razorpay/i)
  })
})

describe('POST /api/payments/verify', () => {
  const good = () => ({
    razorpay_order_id: 'order_TEST1234',
    razorpay_payment_id: 'pay_TEST5678',
    razorpay_signature: sign('order_TEST1234|pay_TEST5678', KEY_SECRET),
  })
  const capturedPayment = { id: 'pay_TEST5678', order_id: 'order_TEST1234', amount: 19900, currency: 'INR', status: 'captured' }

  it('rejects a forged signature and grants nothing', async () => {
    const { POST } = await import('@/app/api/payments/verify/route')
    const res = await POST(post('/api/payments/verify', { ...good(), razorpay_signature: 'f'.repeat(64) }))
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects missing fields', async () => {
    const { POST } = await import('@/app/api/payments/verify/route')
    expect((await POST(post('/api/payments/verify', { razorpay_order_id: 'order_TEST1234' }))).status).toBe(400)
  })

  it("cannot apply someone else's order", async () => {
    const s = await import('@/lib/supabase-server')
    vi.mocked(s.createServerSupabaseClient).mockResolvedValue(userClient({ ownsOrder: false }) as never)
    const { POST } = await import('@/app/api/payments/verify/route')
    expect((await POST(post('/api/payments/verify', good()))).status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('confirms the payment with Razorpay, then applies the amount Razorpay reports', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(capturedPayment), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { POST } = await import('@/app/api/payments/verify/route')
    const res = await POST(post('/api/payments/verify', good()))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, plan: 'plus' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/payments/pay_TEST5678')
    expect(rpc).toHaveBeenCalledWith('apply_payment', { p_order_id: 'order_TEST1234', p_payment_id: 'pay_TEST5678', p_amount_paise: 19900 })
  })

  it('captures an authorized payment before applying it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...capturedPayment, status: 'authorized' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(capturedPayment), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { POST } = await import('@/app/api/payments/verify/route')
    expect((await POST(post('/api/payments/verify', good()))).status).toBe(200)
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.razorpay.com/v1/payments/pay_TEST5678/capture')
  })

  it('does not apply a payment that failed or belongs to another order', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...capturedPayment, order_id: 'order_OTHER999' }), { status: 200 })))
    const { POST } = await import('@/app/api/payments/verify/route')
    expect((await POST(post('/api/payments/verify', good()))).status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('POST /api/payments/webhook', () => {
  const captured = {
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_TEST5678', order_id: 'order_TEST1234', amount: 19900, currency: 'INR', status: 'captured' } } },
  }
  const deliver = (evt: object, opts: { secret?: string; id?: string } = {}) => {
    const raw = JSON.stringify(evt)
    return post('/api/payments/webhook', raw, {
      'x-razorpay-signature': sign(raw, opts.secret ?? WEBHOOK_SECRET),
      'x-razorpay-event-id': opts.id ?? 'evt_1',
    })
  }

  it('rejects a bad signature', async () => {
    const { POST } = await import('@/app/api/payments/webhook/route')
    expect((await POST(deliver(captured, { secret: 'wrong' }))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('applies a captured payment from the signed payload', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { POST } = await import('@/app/api/payments/webhook/route')
    expect((await POST(deliver(captured))).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('apply_payment', { p_order_id: 'order_TEST1234', p_payment_id: 'pay_TEST5678', p_amount_paise: 19900 })
    expect(fetchMock).not.toHaveBeenCalled() // the signed payload is trusted; no extra API call
  })

  it('skips a duplicate delivery', async () => {
    insert.mockResolvedValue({ error: { code: '23505' } })
    const { POST } = await import('@/app/api/payments/webhook/route')
    const res = await POST(deliver(captured))
    expect(await res.json()).toMatchObject({ duplicate: true })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('handles refunds and failures', async () => {
    const { POST } = await import('@/app/api/payments/webhook/route')
    await POST(deliver({ event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_TEST5678', amount: 19900 } } } }, { id: 'evt_2' }))
    expect(rpc).toHaveBeenCalledWith('refund_payment', { p_payment_id: 'pay_TEST5678' })
    await POST(deliver({ event: 'payment.failed', payload: { payment: { entity: { ...captured.payload.payment.entity, status: 'failed' } } } }, { id: 'evt_3' }))
    expect(rpc).toHaveBeenCalledWith('mark_payment_failed', { p_order_id: 'order_TEST1234' })
  })

  it('asks Razorpay to retry when processing fails, and forgets the event id so the retry runs', async () => {
    rpc.mockRejectedValue(new Error('db down'))
    const { POST } = await import('@/app/api/payments/webhook/route')
    expect((await POST(deliver(captured))).status).toBe(500)
    expect(del).toHaveBeenCalledWith('event_id', 'evt_1')
  })
})
