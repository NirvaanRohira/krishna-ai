import { NextResponse } from 'next/server'
import { APP_COOKIE, CHALLENGE_RE } from '@/lib/auth/app-handoff'

// Step 1 of signing in to the mobile app: the app opens this URL in a browser tab with its
// PKCE challenge. We remember the challenge in a short-lived cookie, then send the person
// through the website's normal sign-in and onboarding; /auth/app-handoff finishes in the app.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const challenge = url.searchParams.get('challenge') ?? ''
  if (!CHALLENGE_RE.test(challenge)) {
    return NextResponse.redirect(new URL('/', url.origin))
  }
  const res = NextResponse.redirect(new URL('/auth/app-handoff', url.origin))
  res.cookies.set(APP_COOKIE, challenge, {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax', // sent on the top-level navigation back from Google or the email link
    path: '/',
    maxAge: 15 * 60,
  })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
