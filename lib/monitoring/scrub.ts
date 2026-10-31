// Error reports must never carry what people tell Kanha. Conversations are sensitive
// personal data (beliefs, grief, health); we send stack traces and routes, nothing else.
type AnyEvent = {
  request?: { data?: unknown; cookies?: unknown; headers?: Record<string, string>; query_string?: unknown }
  user?: { id?: string | number; email?: string; ip_address?: string | null; username?: string }
  extra?: Record<string, unknown>
  breadcrumbs?: Array<{ category?: string; data?: Record<string, unknown> }>
}

const SENSITIVE_KEYS = /message|content|text|prompt|transcript|history|email|token|password|secret|key/i

// Generic over any SDK event shape; we only touch the fields below.
export function scrubEvent<T>(input: T): T {
  const event = input as unknown as AnyEvent
  if (event.request) {
    delete event.request.data
    delete event.request.cookies
    delete event.request.query_string
    if (event.request.headers) {
      const ua = event.request.headers['user-agent']
      event.request.headers = ua ? { 'user-agent': ua } : {}
    }
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {}
  if (event.extra) {
    for (const k of Object.keys(event.extra)) if (SENSITIVE_KEYS.test(k)) delete event.extra[k]
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => (b.data ? { ...b, data: { url: b.data.url, method: b.data.method, status_code: b.data.status_code } } : b))
  }
  return input
}
