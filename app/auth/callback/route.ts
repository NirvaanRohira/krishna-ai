import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const DEFAULT_NEXT = '/chat'

// Only allow relative, same-site paths. Reject anything that could send the
// user off-site: protocol-relative URLs (`//evil.com`), backslash tricks
// (`/\evil.com`), or absolute URLs (`https://evil.com`, `next=@evil.com`).
function safeNext(next: string | null): string {
  if (!next) return DEFAULT_NEXT
  if (!next.startsWith('/')) return DEFAULT_NEXT
  if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_NEXT
  return next
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // No code, or the exchange failed: send to a safe default.
  return NextResponse.redirect(`${origin}${DEFAULT_NEXT}`)
}
