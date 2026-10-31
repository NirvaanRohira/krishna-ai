import { NextResponse } from 'next/server'

// Liveness probe for Cloud Run / uptime monitors. Deliberately does no DB or LLM call:
// a health check that hits paid APIs every 10s costs money and can cascade an outage.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    { ok: true, version: process.env.K_REVISION || process.env.VERCEL_GIT_COMMIT_SHA || 'dev' },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
