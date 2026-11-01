import 'server-only'
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from '@/lib/log'

// Web push for the morning verse. Keys: VAPID_PRIVATE_KEY (secret) and
// NEXT_PUBLIC_VAPID_PUBLIC_KEY; VAPID_SUBJECT is a contact (mailto: or https:).

/**
 * We only ever POST to the browser vendors' push services. A subscription endpoint is
 * chosen by the browser, but a malicious client could send any URL; without this
 * allowlist our server could be made to POST to internal addresses (SSRF).
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /^web\.push\.apple\.com$/]

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
}

type Sub = { id: number; endpoint: string; p256dh: string; auth: string }

/** Sends one notification to every subscriber; removes subscriptions the browser has dropped. */
export async function sendToAll(admin: SupabaseClient, payload: { title: string; body: string; url: string }) {
  if (!pushConfigured()) return { sent: 0, removed: 0, skipped: 'push not configured' }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@example.com', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
  let sent = 0
  let removed = 0
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').order('id').range(from, from + 499)
    if (error) throw error
    const subs = (data ?? []) as Sub[]
    await Promise.all(subs.map(async (s) => {
      if (!isAllowedPushEndpoint(s.endpoint)) return
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' })
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', s.id)
          removed++
        } else {
          log.warn('push', 'send failed', { status })
        }
      }
    }))
    if (subs.length < 500) break
  }
  return { sent, removed }
}
