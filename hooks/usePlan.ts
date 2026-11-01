'use client'
import { useCallback, useEffect, useState } from 'react'

export type PlanState = { plan: 'free' | 'plus' | 'premium' | string; validUntil: string | null; signedIn: boolean }

/** The current user's plan. `refresh()` re-reads it (e.g. right after a purchase). */
export function usePlan() {
  const [state, setState] = useState<PlanState | null>(null)
  const refresh = useCallback(async () => {
    const r = await fetch('/api/account/plan', { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setState(await r.json())
  }, [])
  useEffect(() => {
    let live = true
    fetch('/api/account/plan', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (live && s) setState(s) })
      .catch(() => {})
    return () => { live = false }
  }, [])
  return { ...(state ?? { plan: 'free', validUntil: null, signedIn: false }), loaded: state !== null, refresh }
}

export function formatPlanDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}

export const PLAN_NAMES: Record<string, string> = { free: 'Free', plus: 'Plus', premium: 'Premium' }
