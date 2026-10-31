import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ rpc })) }))

const SECRET = 'a-very-long-cron-secret-123'
const call = (task: string, auth = `Bearer ${SECRET}`) =>
  new Request(`http://x/api/cron?task=${task}`, { method: 'POST', headers: { authorization: auth } })

describe('/api/cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok')))
  })

  it('rejects calls without the secret', async () => {
    const { POST } = await import('@/app/api/cron/route')
    expect((await POST(call('spend', 'Bearer nope'))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('alerts the webhook when estimated daily spend crosses the budget', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example/abc')
    vi.stubEnv('SPEND_ALERT_USD_PER_DAY', '5')
    rpc.mockResolvedValue({ data: [{ active_users: 900, messages: 20000, voice_chars: 300000, llm_in_tokens: 10_000_000, llm_out_tokens: 1_000_000 }], error: null })
    const { POST } = await import('@/app/api/cron/route')
    const body = await (await POST(call('spend'))).json()
    expect(body.spend).toEqual({ llm: 5.5, tts: 4.8, total: 10.3 })
    expect(body.over).toBe(true)
    expect(body.alerted).toBe(true)
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://hooks.example/abc')
  })

  it('stays quiet under budget', async () => {
    rpc.mockResolvedValue({ data: [{ active_users: 3, messages: 20, voice_chars: 0, llm_in_tokens: 1000, llm_out_tokens: 100 }], error: null })
    const { POST } = await import('@/app/api/cron/route')
    const body = await (await POST(call('spend'))).json()
    expect(body.over).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('runs the retention purge', async () => {
    rpc.mockResolvedValue({ data: { sessions_deleted: 4, usage_rows_deleted: 9 }, error: null })
    const { POST } = await import('@/app/api/cron/route')
    const body = await (await POST(call('purge'))).json()
    expect(rpc).toHaveBeenCalledWith('purge_old_data', { p_months: 12 })
    expect(body.result.sessions_deleted).toBe(4)
  })
})
