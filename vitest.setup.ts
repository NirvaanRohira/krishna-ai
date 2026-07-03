import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom does not implement scrollIntoView — stub it so components that auto-scroll
// on update (e.g. ChatWindow) can render in tests instead of throwing.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

// Mock Next.js navigation for all tests
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}))

// Mock next/headers (used in server components / API routes)
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(() => []),
  }),
  headers: () => new Map(),
}))
