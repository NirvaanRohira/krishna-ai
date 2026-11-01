'use client'
import { useEffect } from 'react'

/** Registers the service worker (installable app, offline page, daily-verse notifications). */
export function PwaSetup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }, [])
  return null
}
