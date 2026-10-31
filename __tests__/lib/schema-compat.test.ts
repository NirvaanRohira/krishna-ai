import { describe, it, expect } from 'vitest'
import { isMissingColumn, isMissingFunction } from '@/lib/schema-compat'

describe('schema-compat', () => {
  it('recognises missing columns and functions, nothing else', () => {
    expect(isMissingColumn({ code: '42703', message: 'column user_profiles.terms_version does not exist' })).toBe(true)
    expect(isMissingColumn({ code: 'PGRST204', message: "Could not find the 'x' column" })).toBe(true)
    expect(isMissingFunction({ code: 'PGRST202', message: 'Could not find the function public.save_exchange' })).toBe(true)
    expect(isMissingColumn({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingFunction(null)).toBe(false)
  })
})
