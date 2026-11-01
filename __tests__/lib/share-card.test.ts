import { describe, it, expect, vi } from 'vitest'
import { wrapLines, drawShareCard, CARD_W, type ShareCardData } from '@/lib/share-card'

const measure = (s: string) => s.length * 10

describe('share card', () => {
  it('wraps words to the width and ends a cut-off line with an ellipsis', () => {
    expect(wrapLines(measure, 'one two three four', 100, 5)).toEqual(['one two', 'three four'])
    const cut = wrapLines(measure, 'a b c d e f g h i j k l m n o p', 50, 2)
    expect(cut).toHaveLength(2)
    expect(cut[1].endsWith('…')).toBe(true)
  })

  it('draws the verse, title, teaching, practice and the AI label, but not the personal part', () => {
    const texts: string[] = []
    const grad = { addColorStop: vi.fn() }
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, k) => {
        if (k === 'fillText') return (s: string) => texts.push(s)
        if (k === 'measureText') return (s: string) => ({ width: measure(s) })
        if (k === 'createRadialGradient') return () => grad
        if (k in t) return t[k as string]
        return () => {}
      },
      set: (t, k, v) => { t[k as string] = v; return true },
    }) as unknown as CanvasRenderingContext2D
    const d: ShareCardData = {
      bookLatin: 'Bhagavad Gita', heading: 'Adhyāya 5 · Verse 10', folio: '5.10', shloka: 'ब्रह्मण्याधाय कर्माणि\nलिप्यते न स पापेन',
      title: 'Like a lotus leaf on water', teaching: 'Act, offering the work, and remain untouched.', practice: 'Do one task today without checking who noticed.', site: 'kanhacall.vercel.app',
    }
    drawShareCard(ctx, d, { book: 'serif', caps: 'serif', deva: 'serif' })
    const all = texts.join('\n')
    expect(all).toContain('Like a lotus leaf on water')
    expect(all).toContain('लिप्यते न स पापेन')
    expect(all).toContain('FOR TODAY')
    expect(all).toMatch(/written by AI\. Not God, not Krishna/)
    expect(all).toContain('kanhacall.vercel.app')
    expect(CARD_W).toBe(1080)
  })
})
