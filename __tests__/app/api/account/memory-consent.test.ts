import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))

function chain(result: object) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'update']) c[m] = vi.fn(() => c)
  c.maybeSingle = vi.fn().mockResolvedValue(result)
  c.insert = vi.fn().mockResolvedValue({ error: null })
  c.then = (res: (v: unknown) => void) => res({ error: null })
  return c
}

function makeSb(user: object | null = { id: 'u1' }) {
  const tables: Record<string, ReturnType<typeof chain>> = {
    user_profiles: chain({ data: { life_context: 'new parent', previous_guidance: [{ topic: 'sleep', date: '2026-10-01' }], marketing_opt_in: true }, error: null }),
    user_spiritual_profile: chain({ data: { current_life_stage: 'grihastha', recurring_themes: ['duty'], primary_attachments: [] }, error: null }),
    entitlements: chain({ data: null, error: null }),
    consent_events: chain({}),
  }
  return {
    tables,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((t: string) => tables[t]),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }
}

async function withSb(sb: ReturnType<typeof makeSb>) {
  const lib = await import('@/lib/supabase-server')
  vi.mocked(lib.createServerSupabaseClient).mockResolvedValue(sb as never)
}

describe('/api/account/memory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the user what is remembered about them', async () => {
    await withSb(makeSb())
    const { GET } = await import('@/app/api/account/memory/route')
    const body = await (await GET()).json()
    expect(body).toMatchObject({ life_context: 'new parent', life_stage: 'grihastha', themes: ['duty'], plan: 'free' })
    expect(body.past_topics).toEqual([{ topic: 'sleep', date: '2026-10-01' }])
  })

  it('clears it in one step via clear_my_memory', async () => {
    const sb = makeSb()
    await withSb(sb)
    const { DELETE } = await import('@/app/api/account/memory/route')
    expect((await DELETE()).status).toBe(200)
    expect(sb.rpc).toHaveBeenCalledWith('clear_my_memory')
  })

  it('requires auth', async () => {
    await withSb(makeSb(null))
    const { GET, DELETE } = await import('@/app/api/account/memory/route')
    expect((await GET()).status).toBe(401)
    expect((await DELETE()).status).toBe(401)
  })
})

describe('/api/account/consent', () => {
  beforeEach(() => vi.clearAllMocks())
  const req = (body: object) => new Request('http://x/api/account/consent', { method: 'POST', body: JSON.stringify(body) })

  it('withdraws marketing consent and records it in the ledger', async () => {
    const sb = makeSb()
    await withSb(sb)
    const { POST } = await import('@/app/api/account/consent/route')
    const res = await POST(req({ marketing: false }))
    expect(res.status).toBe(200)
    expect(sb.tables.user_profiles.update).toHaveBeenCalledWith({ marketing_opt_in: false })
    expect(sb.tables.consent_events.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'marketing', granted: false }))
  })

  it('rejects non-boolean input', async () => {
    await withSb(makeSb())
    const { POST } = await import('@/app/api/account/consent/route')
    expect((await POST(req({ marketing: 'yes' }))).status).toBe(400)
  })
})
