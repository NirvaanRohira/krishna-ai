'use client'
import { avatarModelUrl, loadSavedOutfit, loadSavedStyle, paintedAvatarUrl, rendererFor } from '@/lib/avatar/config'

type Connection = { saveData?: boolean; effectiveType?: string }

/** Whether it's polite to download ahead: not on Data Saver or a 2G connection. */
export function canPrefetch(conn: Connection | undefined): boolean {
  if (!conn) return true
  if (conn.saveData) return false
  return !/(^|-)2g$/.test(conn.effectiveType ?? '')
}

/**
 * Warm the avatar in the background while someone is chatting, so opening avatar mode is
 * near-instant: the renderer's code and the model file they'll see first (HTTP-cached).
 * About 0.5 MB once; skipped on Data Saver and slow connections. Never throws.
 */
export function prefetchAvatar(): void {
  try {
    const conn = (navigator as Navigator & { connection?: Connection }).connection
    if (!canPrefetch(conn)) return
    const outfit = loadSavedOutfit()
    if (rendererFor(outfit, loadSavedStyle()) === 'painted') {
      import('@/components/PaintedAvatar').catch(() => {})
      import('mesh-avatar').catch(() => {})
      const url = paintedAvatarUrl(outfit)
      if (url) fetch(url, { priority: 'low' } as RequestInit).catch(() => {})
      return
    }
    import('@/components/KrishnaAvatar').catch(() => {})
    import('three').catch(() => {})
    import('three/examples/jsm/loaders/GLTFLoader.js').catch(() => {})
    import('three/examples/jsm/libs/meshopt_decoder.module.js').catch(() => {})
    fetch(avatarModelUrl(outfit), { priority: 'low' } as RequestInit).catch(() => {})
  } catch { /* prefetching is best-effort */ }
}
