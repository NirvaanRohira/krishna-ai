import { describe, it, expect } from 'vitest'
import { canPrefetch } from '@/lib/avatar/prefetch'

describe('avatar prefetch', () => {
  it('downloads ahead on normal connections, never on Data Saver or 2G', () => {
    expect(canPrefetch(undefined)).toBe(true)
    expect(canPrefetch({ effectiveType: '4g' })).toBe(true)
    expect(canPrefetch({ effectiveType: '3g' })).toBe(true)
    expect(canPrefetch({ saveData: true, effectiveType: '4g' })).toBe(false)
    expect(canPrefetch({ effectiveType: '2g' })).toBe(false)
    expect(canPrefetch({ effectiveType: 'slow-2g' })).toBe(false)
  })
})
