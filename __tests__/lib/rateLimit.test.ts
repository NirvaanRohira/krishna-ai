import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { checkRateLimit, rateLimitKey, __resetRateLimitStore } from '@/lib/rateLimit'

describe('checkRateLimit', () => {
  beforeEach(() => {
    __resetRateLimitStore()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests under the limit', () => {
    const opts = { limit: 3, windowMs: 60_000 }
    const r1 = checkRateLimit('user-a', opts)
    const r2 = checkRateLimit('user-a', opts)
    const r3 = checkRateLimit('user-a', opts)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
    expect(r3.allowed).toBe(true)
    expect(r1.remaining).toBe(2)
    expect(r2.remaining).toBe(1)
    expect(r3.remaining).toBe(0)
  })

  it('blocks requests over the limit', () => {
    const opts = { limit: 2, windowMs: 60_000 }
    checkRateLimit('user-b', opts)
    checkRateLimit('user-b', opts)
    const blocked = checkRateLimit('user-b', opts)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it('resets after the window elapses', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const opts = { limit: 1, windowMs: 1000 }
    expect(checkRateLimit('user-c', opts).allowed).toBe(true)
    expect(checkRateLimit('user-c', opts).allowed).toBe(false)
    // advance past the window
    vi.setSystemTime(1500)
    expect(checkRateLimit('user-c', opts).allowed).toBe(true)
  })

  it('keeps separate keys independent', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    expect(checkRateLimit('key-1', opts).allowed).toBe(true)
    expect(checkRateLimit('key-1', opts).allowed).toBe(false)
    // a different key is unaffected
    expect(checkRateLimit('key-2', opts).allowed).toBe(true)
  })

  it('uses sane defaults when opts are omitted', () => {
    const r = checkRateLimit('defaults-key')
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBeGreaterThanOrEqual(0)
  })
})

describe('rateLimitKey', () => {
  it('prefers the userId when provided', () => {
    const req = new Request('http://localhost/api/tts', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    expect(rateLimitKey(req, 'user-123')).toBe('user-123')
  })

  it('falls back to the first x-forwarded-for hop when no userId', () => {
    const req = new Request('http://localhost/api/tts', {
      headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' },
    })
    // IP-derived keys are namespaced so a spoofed IP header can't collide
    // with a real user's id-derived bucket.
    expect(rateLimitKey(req)).toBe('ip:9.9.9.9')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('http://localhost/api/tts', {
      headers: { 'x-real-ip': '5.5.5.5' },
    })
    expect(rateLimitKey(req)).toBe('ip:5.5.5.5')
  })

  it('returns a stable unknown key when no IP headers exist', () => {
    const req = new Request('http://localhost/api/tts')
    const key = rateLimitKey(req)
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
  })
})
