// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

// The avatar stage the mobile apps drive (app/embed/avatar).
vi.mock('next/dynamic', () => ({ default: () => (props: { outfitId?: string; url?: string }) => <div data-testid="avatar" data-outfit={props.outfitId ?? props.url} /> }))

afterEach(() => { cleanup(); delete (window as unknown as { KanhaApp?: unknown }).KanhaApp })

describe('AvatarEmbed', () => {
  it('tells the app it is ready and exposes play / stop / setOutfit', async () => {
    const postMessage = vi.fn()
    ;(window as unknown as { KanhaApp: unknown }).KanhaApp = { postMessage }
    const { default: AvatarEmbed } = await import('@/components/AvatarEmbed')
    const { getByTestId } = render(<AvatarEmbed initialOutfit="royal" />)
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'ready' }))
    const api = (window as unknown as { kanhaAvatar: { setOutfit(id: string): void; stop(): void } }).kanhaAvatar
    expect(getByTestId('avatar').dataset.outfit).toContain('royal')
    act(() => api.setOutfit('divine'))
    expect(getByTestId('avatar').dataset.outfit).toBe('divine')
    act(() => api.setOutfit('<script>'))
    expect(getByTestId('avatar').dataset.outfit).toBe('divine')
    api.stop()
  })

  it('without an app listening (a plain browser) nothing breaks', async () => {
    const { default: AvatarEmbed } = await import('@/components/AvatarEmbed')
    expect(() => render(<AvatarEmbed initialOutfit="pastoral" />)).not.toThrow()
  })
})
