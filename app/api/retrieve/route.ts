import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit, rateLimitKey } from '@/lib/rateLimit'
import { denseRetrieve } from '@/lib/retrieval/dense'

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { allowed, retryAfterSec } = checkRateLimit(rateLimitKey(req, user.id), {
    limit: 30,
    windowMs: 60_000,
  })
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { query } = body

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  try {
    // User-scoped (anon key) client: krishna_corpus has a public-read RLS policy
    // and match_corpus is SECURITY INVOKER, so no service-role bypass is needed.
    const results = await denseRetrieve(query, { supabaseClient: supabase })
    return NextResponse.json({ results })
  } catch (err) {
    console.error('[retrieve] denseRetrieve failed:', err)
    return NextResponse.json({ error: 'Retrieval failed' }, { status: 500 })
  }
}
