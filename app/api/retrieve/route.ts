import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denseRetrieve } from '@/lib/retrieval/dense'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { query } = body

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const results = await denseRetrieve(query, { supabaseClient: supabase })
    return NextResponse.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
