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

  // ── Only guard /chat and /account; send signed-in visitors past /login ──
  const isLogin = pathname === '/login'
  if (!pathname.startsWith('/chat') && !pathname.startsWith('/account') && !pathname.startsWith('/history') && !isLogin) {
    return NextResponse.next()
  }

  // Supabase's recommended pattern: refreshed tokens are written to BOTH the request
  // (so this request sees them) and the response (so the browser keeps them). Losing a
  // rotated refresh token signs the user out, so redirects below carry the cookies too.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const redirectTo = (path: string) => {
    const r = NextResponse.redirect(new URL(path, request.url))
    response.cookies.getAll().forEach((c) => r.cookies.set(c))
    return r
  }

  if (isLogin) return user ? redirectTo('/chat') : response
  if (!user) return redirectTo('/login')

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
    if (!legacy?.onboarding_complete) return redirectTo('/onboarding')
    return response
  }

  if (!profile?.onboarding_complete || profile.terms_version !== TERMS_VERSION) {
    return redirectTo('/onboarding')
  }

  return response
}

export const config = {
  matcher: ['/chat', '/chat/:path*', '/account', '/history', '/history/:path*', '/login', '/api/:path*'],
}
