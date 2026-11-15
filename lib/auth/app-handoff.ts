import 'server-only'
import { createHash, randomBytes } from 'node:crypto'

// Shared pieces of the mobile-app sign-in (docs/MOBILE_PLAN.md, phase 1).

/** Cookie that marks "this browser sign-in is for the app" and carries its PKCE challenge. */
export const APP_COOKIE = 'kanha_app'
/** The Android app's package; the intent link only opens this app. */
export const ANDROID_PACKAGE = 'app.kanha.android'

/** RFC 7636 S256 challenge: 43 base64url characters. */
export const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/
/** A one-time code we issue: 32 random bytes as base64url (43 characters). */
export const CODE_RE = /^[A-Za-z0-9_-]{43}$/
/** RFC 7636 verifier: 43 to 128 unreserved characters. */
export const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/

export function newCode(): { code: string; hash: string } {
  const code = randomBytes(32).toString('base64url') // CSPRNG, 256 bits
  return { code, hash: createHash('sha256').update(code, 'utf8').digest('hex') }
}

/**
 * Opens the app on Android (only this package, so another app can't catch the code; if it's
 * not installed, Chrome offers the Play Store). The verifier makes the code useless anyway.
 */
export function appIntentUrl(code: string): string {
  return `intent://auth?code=${code}#Intent;scheme=kanha;package=${ANDROID_PACKAGE};end`
}

/** The `exp` claim of a Supabase access token, in seconds since 1970 (0 if unreadable). */
export function tokenExpiry(accessToken: string): number {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return typeof payload.exp === 'number' ? payload.exp : 0
  } catch {
    return 0
  }
}
