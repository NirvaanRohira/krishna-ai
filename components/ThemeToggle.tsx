'use client'
import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'
const KEY = 'kanha.theme'

// The theme lives on <html data-theme>, set before paint by app/layout.tsx. Watch it, so
// every toggle on the page stays in sync.
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => mo.disconnect()
}
const read = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

/** Dawn (light, default) ↔ night. The choice is saved on this device only. */
export function ThemeToggle({ className = 'icon-btn' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => 'light' as Theme)

  function flip() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { window.localStorage.setItem(KEY, next) } catch { /* storage blocked */ }
  }

  const label = theme === 'dark' ? 'Switch to dawn (light) theme' : 'Switch to night (dark) theme'
  return (
    <button type="button" className={className} onClick={flip} aria-label={label} title={label}>
      {theme === 'dark' ? (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  )
}
