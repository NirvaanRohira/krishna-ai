import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/session', () => ({ startSession: vi.fn(), saveExchange: vi.fn(), endSession: vi.fn(), resumeSession: vi.fn() }))
vi.mock('@/lib/llm', () => ({ generateText: vi.fn(), generateTextStream: vi.fn(), classify: vi.fn(), errorCode: () => 'internal' }))
vi.mock('@/lib/quota', async (orig) => ({ ...(await orig<typeof import('@/lib/quota')>()), consumeQuota: vi.fn(), recordLlmUsage: vi.fn() }))

function sb() {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) }, from: vi.fn(), rpc: vi.fn() }
}
const post = (url: string, body: object) =>
  new Request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

describe('plan quotas at the API edge', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const lib = await import('@/lib/supabase-server')
    vi.mocked(lib.createServerSupabaseClient).mockResolvedValue(sb() as never)
    const { __resetRateLimitStore } = await import('@/lib/rateLimit')
    __resetRateLimitStore()
  })

  it('chat returns 429 with a friendly upgrade message when the daily quota is used up, before any LLM call', async () => {
    const q = await import('@/lib/quota')
    vi.mocked(q.consumeQuota).mockResolvedValue({ allowed: false, reason: 'daily', plan: 'free', limit: 10 })
    const llm = await import('@/lib/llm')
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(post('http://x/api/chat', { message: 'hello' }))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe('daily')
    expect(body.error).toMatch(/today's 10 messages/)
    expect(body.error).toMatch(/Plus/)
    expect(llm.generateTextStream).not.toHaveBeenCalled()
  })

  it('chat burst limit sends Retry-After', async () => {
    const q = await import('@/lib/quota')
    vi.mocked(q.consumeQuota).mockResolvedValue({ allowed: false, reason: 'rate', plan: 'free', limit: 6 })
    const { POST } = await import('@/app/api/chat/route')
    const res = await POST(post('http://x/api/chat', { message: 'hello' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })

  it('TTS refuses once the daily voice allowance is spent (text replies are unaffected)', async () => {
    const q = await import('@/lib/quota')
    vi.mocked(q.consumeQuota).mockResolvedValue({ allowed: false, reason: 'daily', plan: 'free', limit: 3000 })
    const { POST } = await import('@/app/api/tts/route')
    const res = await POST(post('http://x/api/tts', { text: 'Namaste friend' }))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatch(/spoken replies/)
  })

  it('quota helper fails open if the database check errors', async () => {
    const { consumeQuota } = await vi.importActual<typeof import('@/lib/quota')>('@/lib/quota')
    const r = await consumeQuota({ rpc: vi.fn().mockRejectedValue(new Error('db down')) } as never, 'message')
    expect(r).toEqual({ allowed: true, reason: 'error' })
  })
})
