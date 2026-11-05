import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/llm', () => ({ generateText: vi.fn() }))

describe('push endpoint allowlist (SSRF guard)', () => {
  it('accepts the browser push services only', async () => {
    const { isAllowedPushEndpoint } = await import('@/lib/push')
    for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/QAB', 'https://wns2-par02p.notify.windows.com/w/?token=1'])
      expect(isAllowedPushEndpoint(ok)).toBe(true)
    for (const bad of ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://localhost/x', 'https://fcm.googleapis.com.evil.com/x', 'https://fcm.googleapis.com:8443/x', 'javascript:alert(1)', 42])
      expect(isAllowedPushEndpoint(bad)).toBe(false)
  })
})

describe('daily verse', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rotates through the curated list by India date', async () => {
    const { verseForDay, CURATED, indiaDay } = await import('@/lib/daily-verse')
    const a = verseForDay('2026-11-02')
    const b = verseForDay('2026-11-03')
    expect(CURATED).toContainEqual(a)
    expect(a).not.toEqual(b)
    // 20:00 UTC on 1 Nov is already 2 Nov in India
    expect(indiaDay(Date.parse('2026-11-01T20:00:00Z'))).toBe('2026-11-02')
  })

  it('writes the page once from the model and reuses it after', async () => {
    const { generateText } = await import('@/lib/llm')
    vi.mocked(generateText).mockResolvedValue('Here you go: {"title":"Work, not fruit","moment":"m","teaching":"t","life":"l","practice":"p"}')
    const inserted: unknown[] = []
    let stored: unknown = null
    const q = (result: () => unknown) => {
      const c: Record<string, unknown> = {}
      for (const k of ['select', 'eq']) c[k] = () => c
      c.maybeSingle = async () => ({ data: result() })
      return c
    }
    const admin = {
      from: (t: string) => t === 'daily_verses'
        ? { ...q(() => stored), insert: async (r: unknown) => { inserted.push(r); stored = r; return { error: null } } }
        : q(() => ({ text: 'karmaṇy evādhikāras te' })),
    }
    const { ensureDailyVerse } = await import('@/lib/daily-verse')
    const v = await ensureDailyVerse(admin as never, '2026-11-02')
    expect(v).toMatchObject({ day: '2026-11-02', title: 'Work, not fruit', text_source: 'bhagavad_gita' })
    await ensureDailyVerse(admin as never, '2026-11-02')
    expect(generateText).toHaveBeenCalledTimes(1)
    expect(inserted).toHaveLength(1)
  })

  it('stores nothing if the model returns junk', async () => {
    const { generateText } = await import('@/lib/llm')
    vi.mocked(generateText).mockResolvedValue('sorry, no')
    const admin = { from: () => { const c: Record<string, unknown> = {}; for (const k of ['select', 'eq']) c[k] = () => c; c.maybeSingle = async () => ({ data: null }); c.insert = vi.fn(); return c } }
    const { ensureDailyVerse } = await import('@/lib/daily-verse')
    expect(await ensureDailyVerse(admin as never, '2026-11-04')).toBeNull()
  })
})

describe('morning notification language', () => {
  it('sends each subscriber the notification in their interface language', async () => {
    vi.resetModules()
    const sent: { endpoint: string; body: string }[] = []
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn(async (sub: { endpoint: string }, body: string) => { sent.push({ endpoint: sub.endpoint, body }) }) } }))
    vi.stubEnv('VAPID_PRIVATE_KEY', 'k')
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'p')
    const rows = [
      { id: 1, endpoint: 'https://fcm.googleapis.com/fcm/send/a', p256dh: 'x', auth: 'y', lang: 'hi' },
      { id: 2, endpoint: 'https://fcm.googleapis.com/fcm/send/b', p256dh: 'x', auth: 'y', lang: 'en' },
    ]
    const admin = { from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: rows, error: null }) }) }) }) }
    const { sendToAll } = await import('@/lib/push')
    await sendToAll(admin as never, {
      en: { title: "Today's verse", body: 'Self as friend', url: '/verse' },
      hi: { title: 'आज का श्लोक', body: 'मन ही मित्र', url: '/verse' },
    })
    expect(JSON.parse(sent.find((s) => s.endpoint.endsWith('/a'))!.body).title).toBe('आज का श्लोक')
    expect(JSON.parse(sent.find((s) => s.endpoint.endsWith('/b'))!.body).title).toBe("Today's verse")
    vi.unstubAllEnvs()
    vi.doUnmock('web-push')
  })
})
