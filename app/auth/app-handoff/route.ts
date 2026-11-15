import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { APP_COOKIE, CHALLENGE_RE, appIntentUrl, newCode } from '@/lib/auth/app-handoff'
import { TERMS_VERSION } from '@/lib/legal'
import { log } from '@/lib/log'

// Step 2 of signing in to the mobile app. Reached once the person is signed in on the website
// (directly, or by the proxy when /chat is reached while an app sign-in is in progress).
// Stores their session under a one-time code (2 minutes, PKCE-bound; see the
// 20261116000000 migration) and opens the app with the code.
export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Type': 'text/html; charset=utf-8' }

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const cookieStore = await cookies()
  const challenge = cookieStore.get(APP_COOKIE)?.value ?? ''
  if (!CHALLENGE_RE.test(challenge)) return NextResponse.redirect(new URL('/chat', origin))

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', origin))

  // The app gets no way around the terms, the 18+ confirmation or the AI disclosure.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_complete, terms_version')
    .eq('user_id', user.id)
    .single()
  if (!profile?.onboarding_complete || profile.terms_version !== TERMS_VERSION) {
    return NextResponse.redirect(new URL('/onboarding', origin))
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token || !session.refresh_token) return NextResponse.redirect(new URL('/login', origin))

  const { code, hash } = newCode()
  const { error } = await supabase.from('app_handoffs').insert({
    code_hash: hash,
    user_id: user.id,
    challenge,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (error) {
    log.error('auth', 'app handoff insert failed', { userId: user.id })
    return new NextResponse(page('Something went wrong', 'Please go back to the Kanha app and sign in again.'), { status: 500, headers: HEADERS })
  }

  const target = appIntentUrl(code)
  const res = new NextResponse(page('Opening Kanha…', 'You’re signed in. If the app doesn’t open by itself, tap the button.', target), { headers: HEADERS })
  // The app now owns this session. Clear it from the browser so the two never refresh the
  // same token (Supabase would see the reuse and end the session for both).
  res.cookies.set(APP_COOKIE, '', { path: '/', maxAge: 0 })
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith('sb-')) res.cookies.set(c.name, '', { path: '/', maxAge: 0 })
  }
  return res
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

function page(title: string, body: string, href?: string): string {
  const link = href ? escapeHtml(href) : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${href ? `<meta http-equiv="refresh" content="0;url=${link}">` : ''}<title>${escapeHtml(title)}</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0a0b1e;color:#eeebff;font:17px/1.55 system-ui,sans-serif}
main{max-width:22rem;padding:24px;text-align:center}h1{font:400 1.75rem Georgia,serif;margin:0 0 8px}p{color:#bdbbe0;margin:0 0 24px}
a{display:inline-block;padding:14px 28px;border-radius:999px;background:#e9bb62;color:#231705;text-decoration:none;font-weight:500}
small{display:block;margin-top:24px;color:#9593bd;font-size:13px}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>${href ? `<a href="${link}">Open the Kanha app</a>` : ''}
<small>Kanha is an AI drawing from Sanskrit texts. It is not God, not Krishna, and not a spiritual authority.</small></main></body></html>`
}
