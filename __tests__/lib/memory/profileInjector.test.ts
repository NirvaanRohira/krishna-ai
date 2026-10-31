import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prompts/system_v0', () => ({
  SYSTEM_PROMPT_V0: 'V0_SYSTEM_PROMPT',
}))

vi.mock('@/lib/prompts/system_v2', () => ({
  SYSTEM_PROMPT_V2: 'V2_SYSTEM_PROMPT',
}))

const FAKE_USER_PROFILE = {
  life_context: 'Struggling with career change, feels pulled between duty to family and personal ambition',
  previous_guidance: [
    { date: '2026-04-01', topic: 'duty', texts_cited: ['Gita 3.19'], summary: 'Discussed nishkama karma' },
  ],
}

const FAKE_SPIRITUAL_PROFILE = {
  primary_attachments: ['family approval', 'career success'],
  current_life_stage: 'grihastha',
  recurring_themes: ['duty', 'fear of failure'],
}

function makeSupabase(
  userProfile: object | null = FAKE_USER_PROFILE,
  spiritualProfile: object | null = FAKE_SPIRITUAL_PROFILE
) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: userProfile, error: null }),
        }
      }
      if (table === 'user_spiritual_profile') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: spiritualProfile, error: null }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) }
    }),
  }
}

describe('loadAndInjectProfile', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Profile is cached per-user in-process; reset between tests for isolation.
    const mod = await import('@/lib/memory/profileInjector')
    mod.__clearProfileCache()
  })

  it('uses SYSTEM_PROMPT_V2 (not V0) — V2 has Light/Personal/Deep tiers that handle greetings correctly', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const prompt = await loadAndInjectProfile('user-1', makeSupabase(null, null) as never)
    expect(prompt).toBe('V2_SYSTEM_PROMPT')
    expect(prompt).not.toContain('V0_SYSTEM_PROMPT')
  })

  it('returns V2 system prompt when user has no profile data', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const prompt = await loadAndInjectProfile('user-1', makeSupabase(null, null) as never)
    expect(prompt).toBe('V2_SYSTEM_PROMPT')
  })

  it('appends the profile block AFTER the static system prompt (shared, cacheable prefix)', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const prompt = await loadAndInjectProfile('user-1', makeSupabase() as never)
    expect(prompt.startsWith('V2_SYSTEM_PROMPT')).toBe(true)
    expect(prompt.indexOf('About this person')).toBeGreaterThan(prompt.indexOf('V2_SYSTEM_PROMPT'))
  })

  it('includes life_context from user_profiles in the injected block', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const prompt = await loadAndInjectProfile('user-1', makeSupabase() as never)
    expect(prompt).toContain('career change')
  })

  it('includes primary_attachments from spiritual profile in the injected block', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const prompt = await loadAndInjectProfile('user-1', makeSupabase() as never)
    expect(prompt).toContain('family approval')
  })

  it('includes current_life_stage from spiritual profile in the injected block', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const prompt = await loadAndInjectProfile('user-1', makeSupabase() as never)
    expect(prompt).toContain('grihastha')
  })

  it('includes recurring_themes from spiritual profile in the injected block', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const prompt = await loadAndInjectProfile('user-1', makeSupabase() as never)
    expect(prompt).toContain('duty')
  })

  it('works with only user_profiles data and no spiritual profile', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const prompt = await loadAndInjectProfile('user-1', makeSupabase(FAKE_USER_PROFILE, null) as never)
    expect(prompt).toContain('career change')
    expect(prompt).toContain('V2_SYSTEM_PROMPT')
  })

  it('injects when only current_life_stage is saved (no life_context, no attachments)', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const spiritualOnlyStage = { primary_attachments: [], current_life_stage: 'vanaprastha', recurring_themes: [] }
    const prompt = await loadAndInjectProfile('user-stage', makeSupabase(null, spiritualOnlyStage) as never)
    expect(prompt).toContain('vanaprastha')
    expect(prompt).not.toBe('V2_SYSTEM_PROMPT')
  })

  it('injects when only recurring_themes are saved', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const spiritualOnlyThemes = { primary_attachments: [], current_life_stage: null, recurring_themes: ['grief', 'doubt'] }
    const prompt = await loadAndInjectProfile('user-themes', makeSupabase(null, spiritualOnlyThemes) as never)
    expect(prompt).toContain('grief')
    expect(prompt).not.toBe('V2_SYSTEM_PROMPT')
  })

  it('caches the profile per user — a second call within TTL does not re-query the DB', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const sb = makeSupabase()
    await loadAndInjectProfile('user-cache', sb as never)
    const callsAfterFirst = (sb.from as ReturnType<typeof vi.fn>).mock.calls.length
    await loadAndInjectProfile('user-cache', sb as never)
    const callsAfterSecond = (sb.from as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)
    expect(callsAfterSecond).toBe(callsAfterFirst) // no additional DB round-trip
  })

  it('caches separately per user', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const sbA = makeSupabase(FAKE_USER_PROFILE, null)
    const sbB = makeSupabase({ life_context: 'grieving a loss', previous_guidance: [] }, null)
    const a = await loadAndInjectProfile('user-A', sbA as never)
    const b = await loadAndInjectProfile('user-B', sbB as never)
    expect(a).toContain('career change')
    expect(b).toContain('grieving a loss')
  })
})
