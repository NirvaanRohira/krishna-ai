import { describe, it, expect, vi } from 'vitest'
import { withRetry, HttpError, isTransient } from '@/lib/retry'

describe('withRetry', () => {
  it('retries transient failures then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new HttpError(503, 'unavailable')).mockResolvedValue('ok')
    await expect(withRetry(fn, { baseMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry client errors (4xx other than 429)', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(400, 'bad'))
    await expect(withRetry(fn, { baseMs: 1 })).rejects.toThrow('bad')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after the retry budget', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(429, 'slow down'))
    await expect(withRetry(fn, { retries: 2, baseMs: 1 })).rejects.toThrow('slow down')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('classifies network errors as transient', () => {
    expect(isTransient(new Error('fetch failed'))).toBe(true)
    expect(isTransient(new Error('invalid json'))).toBe(false)
  })
})
