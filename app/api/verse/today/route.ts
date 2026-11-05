import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { indiaDay } from '@/lib/daily-verse'

// Today's verse, public. Falls back to the most recent one if today's isn't written yet
// (the morning job runs at 06:30 IST). The Sanskrit is included only when SHOW_VERSE_TEXT.
// ?lang=hi returns the Hindi page when there is one (the query, not a cookie, picks the
// language so the CDN caches each language separately).
export async function GET(req: Request) {
  const hindi = new URL(req.url).searchParams.get('lang') === 'hi'
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('daily_verses')
    .select('day, text_source, book_chapter, verse, title, moment, teaching, life, practice, hi')
    .lte('day', indiaDay())
    .order('day', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return NextResponse.json({ verse: null }, { headers: { 'Cache-Control': 'no-store' } })
  const { hi, ...english } = data as typeof data & { hi?: Record<string, string> | null }
  const verse = hindi && hi ? { ...english, ...hi } : english

  let text: string | undefined
  if (process.env.SHOW_VERSE_TEXT === 'true') {
    const { data: row } = await supabase
      .from('krishna_corpus')
      .select('text')
      .eq('text_source', data.text_source)
      .eq('book_chapter', data.book_chapter)
      .eq('verse', data.verse)
      .maybeSingle()
    text = row?.text ?? undefined
  }
  return NextResponse.json(
    { verse, source: { text_source: data.text_source, book_chapter: data.book_chapter, verse: data.verse, ...(text ? { text } : {}) } },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
  )
}
