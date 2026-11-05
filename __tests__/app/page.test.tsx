import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { translator, type Lang } from '@/lib/i18n'

let lang: Lang = 'en'
vi.mock('@/lib/i18n/server', () => ({ getT: async () => ({ lang, t: translator(lang) }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

async function renderHome() {
  const { default: Page } = await import('@/app/page')
  render(await Page())
}

describe('Home page', () => {
  beforeEach(() => { lang = 'en' })

  it('renders the product name', async () => {
    await renderHome()
    expect(screen.getByRole('heading', { level: 1, name: /kanha/i })).toBeInTheDocument()
  })

  it('shows a call-to-action link to begin a conversation', async () => {
    await renderHome()
    const cta = screen.getByRole('link', { name: /begin|start|enter/i })
    expect(cta).toBeInTheDocument()
    expect(cta).toHaveAttribute('href', '/chat')
  })

  it('displays the disclaimer text', async () => {
    await renderHome()
    expect(screen.getByText(/AI drawing from Sanskrit texts/i)).toBeInTheDocument()
  })

  it('in Hindi: the title, the call to action and the not-God disclaimer are all in Hindi', async () => {
    lang = 'hi'
    await renderHome()
    expect(screen.getByRole('heading', { level: 1, name: /कान्हा/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'बातचीत शुरू करें' })).toHaveAttribute('href', '/chat')
    expect(screen.getByText(/भगवान नहीं है, कृष्ण नहीं है/)).toBeInTheDocument()
  })
})
