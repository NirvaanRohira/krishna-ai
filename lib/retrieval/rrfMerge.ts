import type { DenseResult } from '@/lib/retrieval/dense'
import type { SparseResult } from '@/lib/retrieval/sparse'

export interface RRFResult {
  id: number
  text_source: string
  book_chapter: number
  verse: number
  text: string
  theme_tags: string[]
  score: number
}

export function rrfMerge(
  dense: DenseResult[],
  sparse: SparseResult[],
  k = 60
): RRFResult[] {
  const scores = new Map<number, number>()
  const meta = new Map<number, Omit<RRFResult, 'score'>>()

  const record = (item: { id: number; text_source: string; book_chapter: number; verse: number; text: string; theme_tags: string[] }, rank: number) => {
    const prev = scores.get(item.id) ?? 0
    scores.set(item.id, prev + 1 / (k + rank))
    if (!meta.has(item.id)) meta.set(item.id, { id: item.id, text_source: item.text_source, book_chapter: item.book_chapter, verse: item.verse, text: item.text, theme_tags: item.theme_tags })
  }

  dense.forEach((item, i) => record(item, i + 1))
  sparse.forEach((item, i) => record(item, i + 1))

  return Array.from(scores.entries())
    .map(([id, score]) => ({ ...meta.get(id)!, score }))
    .sort((a, b) => b.score - a.score)
}
