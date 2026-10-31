import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
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
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_complete')
    .eq('user_id', user.id)
    .single()

  if (!profile?.onboarding_complete) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  return response
}

export const config = {
  matcher: ['/chat', '/chat/:path*', '/account', '/api/:path*'],
}
