import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prompts/system_v0', () => ({
  SYSTEM_PROMPT_V0: 'BASE_SYSTEM_PROMPT',
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns base system prompt when user has no profile data', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const prompt = await loadAndInjectProfile('user-1', makeSupabase(null, null) as never)
    expect(prompt).toBe('BASE_SYSTEM_PROMPT')
  })

  it('prepends profile context block to system prompt when user has data', async () => {
    const { loadAndInjectProfile } = await import('@/lib/memory/profileInjector')
    const prompt = await loadAndInjectProfile('user-1', makeSupabase() as never)
    expect(prompt).toContain('BASE_SYSTEM_PROMPT')
    expect(prompt.indexOf('BASE_SYSTEM_PROMPT')).toBeGreaterThan(0) // context comes first
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
    expect(prompt).toContain('BASE_SYSTEM_PROMPT')
  })
})
