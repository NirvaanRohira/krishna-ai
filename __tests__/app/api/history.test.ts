import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))

const USER = { id: 'user-h-1' }
const SID = '11111111-1111-4111-8111-111111111111'

// A tiny chainable fake of the Supabase query builder. RLS is modelled by the data we return:
// the user-scoped client only ever "sees" the caller's own rows.
function client(opts: { user?: object | null; sessions?: object[]; messages?: object[]; session?: object | null } = {}) {
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {}
    for (const k of ['select', 'gt', 'order', 'limit', 'in', 'eq']) c[k] = () => c
    c.maybeSingle = async () => result
    c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
    return c
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: opts.user === undefined ? USER : opts.user } }) },
    from: vi.fn((table: string) => {
      if (table === 'sessions') {
        return opts.session !== undefined
          ? chain({ data: opts.session })
          : chain({ data: opts.sessions ?? [], error: null })
      }
      return chain({ data: opts.messages ?? [], error: null })
    }),
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
})

async function useClient(c: object) {
  const s = await import('@/lib/supabase-server')
  vi.mocked(s.createServerSupabaseClient).mockResolvedValue(c as never)
}

describe('GET /api/history', () => {
  it('requires sign-in', async () => {
    await useClient(client({ user: null }))
    const { GET } = await import('@/app/api/history/route')
    expect((await GET()).status).toBe(401)
  })

  it("lists the caller's conversations with the first thing they said as the title", async () => {
    await useClient(client({
      sessions: [{ id: SID, started_at: '2026-11-01T08:18:00Z', turn_count: 3 }],
      messages: [
        { session_id: SID, content: 'I do not know how to make money', created_at: '2026-11-01T08:18:01Z' },
        { session_id: SID, content: 'teach me to code', created_at: '2026-11-01T08:19:00Z' },
      ],
    }))
    const { GET } = await import('@/app/api/history/route')
    const body = await (await GET()).json()
    expect(body.conversations).toEqual([{ id: SID, startedAt: '2026-11-01T08:18:00Z', turns: 3, preview: 'I do not know how to make money' }])
  })
})

describe('GET /api/history/[id]', () => {
  const call = async (id: string) => {
    const { GET } = await import('@/app/api/history/[id]/route')
    return GET(new Request('http://x'), { params: Promise.resolve({ id }) })
  }

  it('rejects malformed ids without touching the database', async () => {
    const c = client()
    await useClient(c)
    expect((await call("1' or '1'='1")).status).toBe(404)
    expect(c.from).not.toHaveBeenCalled()
  })

  it("returns 404 for a conversation that isn't the caller's (RLS hides it)", async () => {
    await useClient(client({ session: null }))
    expect((await call(SID)).status).toBe(404)
  })

  it('returns the messages of an owned conversation', async () => {
    await useClient(client({ session: { id: SID, started_at: '2026-11-01T08:18:00Z' }, messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Namaste.' }] }))
    const body = await (await call(SID)).json()
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Namaste.' }])
  })
})
