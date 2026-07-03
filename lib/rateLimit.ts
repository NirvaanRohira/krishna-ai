// In-memory, zero-dependency rate limiter (fixed-window counter).
//
// IMPORTANT — scope: this limiter is PER-INSTANCE. Serverless platforms (Vercel)
// run many isolated instances, so this does NOT enforce a strict global limit —
// it caps a single hot instance and is a safe, cheap default that never touches
// the database. For strict global limits across all instances, swap the Map
// below for @upstash/ratelimit (Redis-backed) behind this same interface
// (checkRateLimit / rateLimitKey). Do NOT add that dependency until it's needed.

interface WindowEntry {
  count: number
  resetAt: number // epoch ms when the current window expires
}

export interface RateLimitOptions {
  limit?: number
  windowMs?: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

const DEFAULT_LIMIT = 30
const DEFAULT_WINDOW_MS = 60_000

// Cap the map so a flood of distinct keys (e.g. spoofed IPs) can't grow memory
// without bound. When exceeded we prune expired entries first, then, if still
// over, evict the oldest-resetting entries.
const MAX_ENTRIES = 10_000

const store = new Map<string, WindowEntry>()

let lastSweep = 0
const SWEEP_INTERVAL_MS = 60_000

function sweepExpired(now: number): void {
  const expired: string[] = []
  store.forEach((entry, key) => {
    if (entry.resetAt <= now) expired.push(key)
  })
  expired.forEach((key) => store.delete(key))
}

function enforceMaxSize(now: number): void {
  if (store.size <= MAX_ENTRIES) return
  sweepExpired(now)
  if (store.size <= MAX_ENTRIES) return
  // Still over budget: evict entries with the soonest reset first.
  const entries: Array<[string, number]> = []
  store.forEach((entry, key) => entries.push([key, entry.resetAt]))
  entries.sort((a, b) => a[1] - b[1])
  const toEvict = store.size - MAX_ENTRIES
  for (let i = 0; i < toEvict; i++) store.delete(entries[i][0])
}

export function checkRateLimit(key: string, opts?: RateLimitOptions): RateLimitResult {
  const limit = opts?.limit ?? DEFAULT_LIMIT
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS
  const now = Date.now()

  // Lazy periodic cleanup so expired windows don't accumulate.
  if (now - lastSweep >= SWEEP_INTERVAL_MS) {
    sweepExpired(now)
    lastSweep = now
  }

  let entry = store.get(key)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs }
    store.set(key, entry)
  }

  const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec }
  }

  entry.count += 1
  enforceMaxSize(now)

  return {
    allowed: true,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSec,
  }
}

// Derive a rate-limit bucket key: prefer the authenticated user id, else fall
// back to the client IP (first x-forwarded-for hop, then x-real-ip).
export function rateLimitKey(req: Request, userId?: string): string {
  if (userId) return userId

  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return `ip:${first}`
  }

  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return `ip:${realIp}`

  return 'ip:unknown'
}

// Test-only: reset the module-level store between tests.
export function __resetRateLimitStore(): void {
  store.clear()
  lastSweep = 0
}
