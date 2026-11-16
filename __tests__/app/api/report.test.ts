import { describe, it, expect, vi, beforeEach } from 'vitest'

// "Report this reply" (Play's AI content policy), web and app.

const supa = { getUser: vi.fn(), rows: vi.fn(), insert: vi.fn() }
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: supa.getUser },
    from: (table: string) => table === 'messages'
      ? { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: supa.rows }) }) }) }) }
      : { insert: supa.insert },
  })),
}))

const SESSION = '6f1c2a9e-0000-4000-8000-000000000001'
const post = (body: unknown, ip = `5.6.7.${Math.floor(Math.random() * 250)}`) =>
  new Request('https://kanhacall.vercel.app/api/report', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(body) })
const call = async (body: unknown, ip?: string) => (await import('@/app/api/report/route')).POST(post(body, ip))

beforeEach(async () => {
  vi.clearAllMocks()
  ;(await import('@/lib/rateLimit')).__resetRateLimitStore()
  supa.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  supa.insert.mockResolvedValue({ error: null })
  supa.rows.mockResolvedValue({ data: [{ id: 'm1', content: 'The  reply\nas stored' }] })
})

describe('POST /api/report', () => {
  it('needs a signed-in user', async () => {
    supa.getUser.mockResolvedValue({ data: { user: null } })
    expect((await call({ reason: 'wrong', reply: 'x' })).status).toBe(401)
  })

  it('rejects unknown reasons and empty replies before touching the database', async () => {
    expect((await call({ reason: 'spam', reply: 'x' })).status).toBe(400)
    expect((await call({ reason: 'wrong', reply: '  ' })).status).toBe(400)
    expect(supa.insert).not.toHaveBeenCalled()
  })

  it('stores the stored message (verified) when it matches what they saw', async () => {
    expect((await call({ sessionId: SESSION, reason: 'harmful', reply: 'The reply as stored', note: 'n', source: 'android' })).status).toBe(200)
    expect(supa.insert.mock.calls[0][0]).toMatchObject({ user_id: 'u1', session_id: SESSION, message_id: 'm1', reply_excerpt: 'The  reply\nas stored', verified: true, reason: 'harmful', note: 'n', source: 'android' })
  })

  it('keeps an unmatched reply for review, marked unverified; a bad session id is dropped', async () => {
    await call({ sessionId: 'not-a-uuid', reason: 'other', reply: 'something else', source: 'evil' })
    expect(supa.insert.mock.calls[0][0]).toMatchObject({ session_id: null, message_id: null, verified: false, reply_excerpt: 'something else', source: 'web' })
  })

  it('the daily cap and RLS refusals are plain answers, never database text', async () => {
    supa.insert.mockResolvedValue({ error: { code: 'P0001', message: 'report limit reached' } })
    expect((await call({ reason: 'wrong', reply: 'x' })).status).toBe(429)
    supa.insert.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } })
    const res = await call({ sessionId: SESSION, reason: 'wrong', reply: 'x' })
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).not.toMatch(/row-level/)
  })

  it('is rate limited per person', async () => {
    for (let i = 0; i < 5; i++) await call({ reason: 'wrong', reply: 'x' }, '9.9.9.9')
    expect((await call({ reason: 'wrong', reply: 'x' }, '9.9.9.9')).status).toBe(429)
  })
})
