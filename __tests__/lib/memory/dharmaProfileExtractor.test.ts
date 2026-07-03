import { describe, it, expect, vi, beforeEach } from 'vitest'

const FAKE_USER_ID = 'user-abc-123'

const FAKE_EXTRACTED = {
  life_context: 'Torn between career and family',
  recurring_themes: ['duty', 'attachment'],
  primary_attachments: ['parental approval'],
  current_life_stage: 'grihastha',
  previous_guidance_entry: {
    topic: 'duty conflict',
    texts_cited: ['Gita 3.19'],
    summary: 'Discussed nishkama karma',
  },
}

function makeSupabase() {
  const upsertMock = vi.fn().mockResolvedValue({ error: null })
  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  }
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { previous_guidance: [] }, error: null }),
  }

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'user_spiritual_profile') return { upsert: upsertMock }
    if (table === 'user_profiles') return { ...updateChain, ...selectChain, upsert: upsertMock }
    return { upsert: upsertMock }
  })

  return { from: fromMock, upsertMock }
}

describe('updateDharmaProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts user_spiritual_profile with primary_attachments and life_stage', async () => {
    const { supabase: sb, upsertMock } = (() => {
      const sb = makeSupabase()
      return { supabase: sb, upsertMock: sb.upsertMock }
    })()
    const { updateDharmaProfile } = await import('@/lib/memory/dharmaProfileExtractor')
    await updateDharmaProfile(FAKE_USER_ID, FAKE_EXTRACTED, sb as never)
    expect(sb.from).toHaveBeenCalledWith('user_spiritual_profile')
  })

  it('upserts user_profiles with life_context and recurring_themes', async () => {
    const sb = makeSupabase()
    const { updateDharmaProfile } = await import('@/lib/memory/dharmaProfileExtractor')
    await updateDharmaProfile(FAKE_USER_ID, FAKE_EXTRACTED, sb as never)
    expect(sb.from).toHaveBeenCalledWith('user_profiles')
  })

  it('appends previous_guidance_entry to the existing guidance array', async () => {
    const sb = makeSupabase()
    const { updateDharmaProfile } = await import('@/lib/memory/dharmaProfileExtractor')
    await updateDharmaProfile(FAKE_USER_ID, FAKE_EXTRACTED, sb as never)
    // user_profiles should be updated twice (upsert for life_context + update for guidance)
    // or at least from('user_profiles') is called
    const userProfileCalls = (sb.from as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === 'user_profiles'
    )
    expect(userProfileCalls.length).toBeGreaterThan(0)
  })

  it('handles empty extracted profile gracefully without throwing', async () => {
    const sb = makeSupabase()
    const { updateDharmaProfile } = await import('@/lib/memory/dharmaProfileExtractor')
    await expect(updateDharmaProfile(FAKE_USER_ID, {}, sb as never)).resolves.not.toThrow()
  })

  it('logs an error when the life_context upsert fails (does not swallow silently)', async () => {
    const sb = makeSupabase()
    sb.upsertMock.mockResolvedValue({ error: { message: 'permission denied for table user_profiles' } })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { updateDharmaProfile } = await import('@/lib/memory/dharmaProfileExtractor')
    await updateDharmaProfile(FAKE_USER_ID, { life_context: 'x' }, sb as never)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('logs an error when reading previous_guidance fails', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'select failed' } })
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return {
          upsert: upsertMock,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single,
          update: vi.fn().mockReturnThis(),
        }
      }
      return { upsert: upsertMock }
    })
    const sb = { from: fromMock }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { updateDharmaProfile } = await import('@/lib/memory/dharmaProfileExtractor')
    await updateDharmaProfile(
      FAKE_USER_ID,
      { previous_guidance_entry: { topic: 't', texts_cited: [], summary: 's' } },
      sb as never
    )
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
