import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { TERMS_VERSION } from '@/lib/legal'
import { isMissingColumn } from '@/lib/schema-compat'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Kill switch ───────────────────────────────────────────────
  if (process.env.KILL_SWITCH === 'true' && pathname !== '/unavailable') {
    return NextResponse.redirect(new URL('/unavailable', request.url))
  }

  // ── CSRF defence-in-depth for state-changing API calls ─────────
  // Auth cookies are SameSite=Lax, which already blocks most cross-site POSTs. We also
  // reject any mutating /api request whose Origin is present and isn't this site.
  if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin')
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.next()
  }

  // ── Only guard /chat and /account ──────────────────────────────
  if (!pathname.startsWith('/chat') && !pathname.startsWith('/account')) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Onboarding gate ───────────────────────────────────────────
  // Also catches people who onboarded before the current terms (and the 18+ / consent
  // boxes) existed: they see onboarding once more and accept the current version.
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('onboarding_complete, terms_version')
    .eq('user_id', user.id)
    .single()

  // Before migration 20261031 is applied there is no terms_version column: keep the old
  // gate (onboarding_complete only) instead of locking everyone out.
  if (isMissingColumn(profileError)) {
    const { data: legacy } = await supabase.from('user_profiles').select('onboarding_complete').eq('user_id', user.id).single()
    if (!legacy?.onboarding_complete) return NextResponse.redirect(new URL('/onboarding', request.url))
    return response
  }

  if (!profile?.onboarding_complete || profile.terms_version !== TERMS_VERSION) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  return response
}

export const config = {
  matcher: ['/chat', '/chat/:path*', '/account', '/api/:path*'],
}
