import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'

// Scheduled jobs, called by Google Cloud Scheduler (or a GitHub Actions cron):
//   POST /api/cron?task=spend   — hourly: estimate today's AI spend, alert if over budget
//   POST /api/cron?task=purge   — daily: delete conversations past the retention window
// Auth: `Authorization: Bearer $CRON_SECRET`. Not reachable without the secret.

export const dynamic = 'force-dynamic'

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || secret.length < 16) return false
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d)

export function estimateSpendUSD(t: { llm_in_tokens: number; llm_out_tokens: number; voice_chars: number }) {
  const llm = (t.llm_in_tokens / 1e6) * num(process.env.LLM_PRICE_IN_PER_M, 0.30)
    + (t.llm_out_tokens / 1e6) * num(process.env.LLM_PRICE_OUT_PER_M, 2.50)
  const tts = (t.voice_chars / 1e6) * num(process.env.TTS_PRICE_PER_M_CHARS, 16)
  return { llm: +llm.toFixed(2), tts: +tts.toFixed(2), total: +(llm + tts).toFixed(2) }
}

async function alert(text: string) {
  const url = process.env.ALERT_WEBHOOK_URL // Slack / Google Chat / Discord incoming webhook
  if (!url) return false
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, content: text }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  return Boolean(res?.ok)
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 500 })
  const task = new URL(req.url).searchParams.get('task')

  if (task === 'spend') {
    const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10) // India date
    const { data, error } = await admin.rpc('usage_totals', { p_day: day })
    if (error) {
      log.error('cron', 'usage_totals failed', {}, error)
      return NextResponse.json({ error: 'usage query failed' }, { status: 500 })
    }
    const row = (Array.isArray(data) ? data[0] : data) ?? {}
    const totals = {
      active_users: Number(row.active_users ?? 0),
      messages: Number(row.messages ?? 0),
      voice_chars: Number(row.voice_chars ?? 0),
      llm_in_tokens: Number(row.llm_in_tokens ?? 0),
      llm_out_tokens: Number(row.llm_out_tokens ?? 0),
    }
    const spend = estimateSpendUSD(totals)
    const budget = num(process.env.SPEND_ALERT_USD_PER_DAY, 20)
    const over = spend.total >= budget
    let alerted = false
    if (over) {
      alerted = await alert(`⚠️ Kanha AI spend today is ~$${spend.total} (LLM $${spend.llm}, voice $${spend.tts}), over the $${budget}/day alert line. ${totals.active_users} users, ${totals.messages} messages.`)
      log.warn('cron', 'daily spend over budget', { ...totals, spend_usd: spend.total, budget_usd: budget })
    } else {
      log.info('cron', 'daily spend ok', { ...totals, spend_usd: spend.total, budget_usd: budget })
    }
    return NextResponse.json({ day, totals, spend, budget, over, alerted })
  }

  if (task === 'purge') {
    const months = Math.max(1, num(process.env.RETENTION_MONTHS, 12))
    const { data, error } = await admin.rpc('purge_old_data', { p_months: months })
    if (error) {
      log.error('cron', 'purge failed', {}, error)
      return NextResponse.json({ error: 'purge failed' }, { status: 500 })
    }
    log.info('cron', 'retention purge done', { months, ...(data as Record<string, number>) })
    return NextResponse.json({ ok: true, months, result: data })
  }

  return NextResponse.json({ error: 'unknown task' }, { status: 400 })
}
