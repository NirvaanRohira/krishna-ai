// Server-side error monitoring (Next.js instrumentation hook). Inert unless SENTRY_DSN is set.
import { scrubEvent } from '@/lib/monitoring/scrub'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.SENTRY_DSN) return
  const Sentry = await import('@sentry/node')
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV || process.env.NODE_ENV,
    release: process.env.K_REVISION || process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    beforeSend: (event) => scrubEvent(event),
  })
}

// Called by Next for any uncaught error in a route handler, page or server action.
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string }
) {
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME !== 'nodejs') return
  const Sentry = await import('@sentry/node')
  Sentry.captureException(err, {
    tags: { route: context.routePath, routeType: context.routeType, method: request.method },
  })
}
