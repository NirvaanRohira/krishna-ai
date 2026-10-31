// Browser error monitoring. Inert unless NEXT_PUBLIC_SENTRY_DSN is set; the SDK is loaded
// lazily so visitors without it configured download nothing extra.
import { scrubEvent } from '@/lib/monitoring/scrub'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (dsn) {
  import('@sentry/browser').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      // Replays would record what people type — never enable them for this product.
      beforeSend: (event) => scrubEvent(event),
    })
  }).catch(() => {})
}
