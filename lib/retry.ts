// Retry with exponential backoff + full jitter, for IDEMPOTENT calls only (TTS synthesis,
// embeddings, reads). Never wrap a stream that already sent tokens or a non-idempotent write.

export type RetryOptions = { retries?: number; baseMs?: number; maxMs?: number; isRetryable?: (err: unknown) => boolean }

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function isTransient(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500
  const msg = err instanceof Error ? err.message.toLowerCase() : ''
  return /timeout|econnreset|econnrefused|socket hang up|fetch failed|network|429|503|502/.test(msg)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseMs = 250, maxMs = 2000, isRetryable = isTransient } = opts
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err
      const cap = Math.min(maxMs, baseMs * 2 ** attempt)
      await sleep(Math.random() * cap) // full jitter: spreads retries so a provider blip isn't stampeded
      attempt++
    }
  }
}

/** fetch with a hard timeout. */
export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(ms) })
}
