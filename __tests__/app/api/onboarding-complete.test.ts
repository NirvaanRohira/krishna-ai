import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn() }))

const ALL_CONSENTS = { ageConfirmed18: true, acceptTerms: true, acceptPrivacy: true, aiDisclosure: true }

function makeRequest(body: object = ALL_CONSENTS) {
  return new Request('http://localhost/api/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/onboarding/complete', () => {
  let upsertMock: ReturnType<typeof vi.fn>
  let insertMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    upsertMock = vi.fn().mockResolvedValue({ error: null })
    insertMock = vi.fn().mockResolvedValue({ error: null })
  })

  function makeSupabase(user: object | null = { id: 'user-123' }) {
    return {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
      from: vi.fn().mockReturnValue({ upsert: upsertMock, insert: insertMock }),
    }
  }

  async function post(body?: object, user?: object | null) {
    const { createServerSupabaseClient } = await import('@/lib/supabase-server')
    const sb = makeSupabase(user === undefined ? { id: 'user-123' } : user)
    vi.mocked(createServerSupabaseClient).mockResolvedValue(sb as never)
    const { POST } = await import('@/app/api/onboarding/complete/route')
    return { res: await POST(makeRequest(body)), sb }
  }

  it('returns 401 for unauthenticated user', async () => {
    const { res } = await post(ALL_CONSENTS, null)
    expect(res.status).toBe(401)
  })

  it('refuses users who do not confirm they are 18+ (no data written)', async () => {
    const { res } = await post({ ...ALL_CONSENTS, ageConfirmed18: false })
    expect(res.status).toBe(403)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('requires every mandatory consent', async () => {
    const { res } = await post({ ...ALL_CONSENTS, acceptPrivacy: false })
    expect(res.status).toBe(400)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('stores consent versions on the profile and records a consent ledger', async () => {
    const { res, sb } = await post()
    expect(res.status).toBe(200)
    expect(sb.from).toHaveBeenCalledWith('user_profiles')
    expect(upsertMock.mock.calls[0][0]).toMatchObject({
      user_id: 'user-123', onboarding_complete: true, age_confirmed_18_plus: true, marketing_opt_in: false,
    })
    expect(sb.from).toHaveBeenCalledWith('consent_events')
    const kinds = (insertMock.mock.calls[0][0] as { kind: string }[]).map((r) => r.kind)
    expect(kinds).toEqual(expect.arrayContaining(['age_18_plus', 'terms', 'privacy', 'ai_disclosure', 'marketing']))
  })

  it('marketing is opt-in only (false unless explicitly true)', async () => {
    await post({ ...ALL_CONSENTS, marketingOptIn: 'yes' })
    expect(upsertMock.mock.calls[0][0].marketing_opt_in).toBe(false)
  })

  it('does not leak DB error text', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'relation secret_table does not exist' } })
    const { res } = await post()
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('secret_table')
  })

  it('does not lock users out if the consent columns are not migrated yet', async () => {
    upsertMock
      .mockResolvedValueOnce({ error: { code: 'PGRST204', message: "Could not find the 'age_confirmed_18_plus' column" } })
      .mockResolvedValueOnce({ error: null })
    const { res } = await post()
    expect(res.status).toBe(200)
    expect(upsertMock.mock.calls[1][0]).toEqual({ user_id: 'user-123', onboarding_complete: true })
  })
})
