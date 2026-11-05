import { describe, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/llm', () => ({ generateText: vi.fn(), GENERATION_MODEL: 'test-model' }))

const ALL_TRUE = { citation_retrieved: true, faithful: true, scene_fits: true, no_invented_quotes: true, not_divine_voice: true, respectful: true, advice_safe: true, practice_fits: true }

describe('spiritual reviewer', () => {
  it('reads a verdict, and will not call a reply "ok" if any check failed', async () => {
    const { parseReview } = await import('@/lib/review/spiritual')
    expect(parseReview(JSON.stringify({ verdict: 'ok', flags: ALL_TRUE, notes: '' }))?.verdict).toBe('ok')
    const r = parseReview('Sure: ' + JSON.stringify({ verdict: 'ok', flags: { ...ALL_TRUE, scene_fits: false }, notes: 'Invented a king.' }))
    expect(r?.verdict).toBe('concern')
    expect(r?.notes).toBe('Invented a king.')
    expect(parseReview(JSON.stringify({ verdict: 'fine', flags: ALL_TRUE }))).toBeNull()
    expect(parseReview(JSON.stringify({ verdict: 'ok', flags: { faithful: true } }))).toBeNull()
    expect(parseReview('no json')).toBeNull()
  })

  it('gives the reviewer the retrieved passages, the question and the reply, and the not-God rule', async () => {
    const { reviewPrompt } = await import('@/lib/review/spiritual')
    const p = reviewPrompt('I feel lost', '<page ref="bhagavad_gita chapter 2 verse 47" title="t">…</page>', [{ label: 'bhagavad_gita 2.47', text: 'karmaṇy evādhikāras te' }])
    expect(p).toContain('bhagavad_gita 2.47: karmaṇy')
    expect(p).toContain('I feel lost')
    expect(p).toContain('never speak as either')
  })

  it('reviews unreviewed pages, stores each verdict once, and flags serious ones', async () => {
    const { generateText } = await import('@/lib/llm')
    vi.mocked(generateText)
      .mockResolvedValueOnce(JSON.stringify({ verdict: 'ok', flags: ALL_TRUE, notes: '' }))
      .mockResolvedValueOnce(JSON.stringify({ verdict: 'serious', flags: { ...ALL_TRUE, not_divine_voice: false }, notes: 'Spoke as Krishna.' }))
    const inserted: Record<string, unknown>[] = []
    const rows = [
      { id: 'm1', session_id: 's', content: '<page ref="x">', created_at: '2026-11-05T01:00:00Z', retrieval_context: [{ id: 1 }], answer_reviews: [] },
      { id: 'm2', session_id: 's', content: '<page ref="y">', created_at: '2026-11-05T02:00:00Z', retrieval_context: [], answer_reviews: [] },
      { id: 'm3', session_id: 's', content: '<page ref="z">', created_at: '2026-11-05T03:00:00Z', retrieval_context: [], answer_reviews: [{ message_id: 'm3' }] },
    ]
    const chain = (result: unknown) => {
      const c: Record<string, unknown> = {}
      for (const k of ['select', 'eq', 'like', 'gte', 'lt', 'order', 'limit', 'in']) c[k] = () => c
      c.maybeSingle = async () => ({ data: { content: 'question' } })
      c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
      return c
    }
    const admin = {
      from: (t: string) => t === 'answer_reviews'
        ? { insert: async (row: Record<string, unknown>) => { inserted.push(row); return { error: null } } }
        : t === 'krishna_corpus' ? chain({ data: [{ text_source: 'bhagavad_gita', book_chapter: 2, verse: 47, text: 'karma' }] })
        : chain({ data: rows, error: null }),
    }
    const { reviewRecentPages } = await import('@/lib/review/spiritual')
    const out = await reviewRecentPages(admin as never, 10)
    expect(out).toMatchObject({ reviewed: 2, serious: 1, skipped: 0 })
    expect(inserted.map((r) => r.message_id).sort()).toEqual(['m1', 'm2'])   // m3 was already reviewed
    expect(inserted.find((r) => r.verdict === 'serious')?.notes).toBe('Spoke as Krishna.')
  })
})
