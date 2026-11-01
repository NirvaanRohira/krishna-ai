import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'
import { sendEmail } from '@/lib/email/send'
import { expiryReminderEmail } from '@/lib/email/templates'
import type { SupabaseClient } from '@supabase/supabase-js'

// Scheduled jobs, called by Vercel Cron (vercel.json; it sends GET with the bearer
// secret automatically when CRON_SECRET is set), Google Cloud Scheduler, or GitHub Actions:
//   POST /api/cron?task=spend   — hourly: estimate today's AI spend, alert if over budget
//   POST /api/cron?task=purge   — daily: delete conversations past the retention window
//   POST /api/cron?task=reminders — daily: email people whose paid pass ends in ~3 days
//   (Vercel Hobby allows two cron jobs, so the daily spend job also runs reminders.)
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

/** Paid passes ending 2–3 days from now get one reminder (the job runs once a day). */
export async function sendExpiryReminders(admin: SupabaseClient): Promise<{ due: number; sent: number }> {
  const from = new Date(Date.now() + 2 * 86_400_000).toISOString()
  const to = new Date(Date.now() + 3 * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('entitlements')
    .select('user_id, plan, valid_until')
    .eq('source', 'razorpay')
    .gte('valid_until', from)
    .lt('valid_until', to)
    .limit(500)
  if (error) throw error
  let sent = 0
  for (const e of data ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(e.user_id)
    const email = u?.user?.email
    if (!email || !e.valid_until) continue
    const mail = expiryReminderEmail({ plan: e.plan, validUntil: e.valid_until })
    if (await sendEmail({ to: email, ...mail, idempotencyKey: `expiry-${e.user_id}-${e.valid_until}` })) sent++
  }
  return { due: data?.length ?? 0, sent }
}

async function runReminders(admin: SupabaseClient) {
  try {
    const r = await sendExpiryReminders(admin)
    log.info('cron', 'expiry reminders', r)
    return r
  } catch (err) {
    log.error('cron', 'expiry reminders failed', {}, err)
    return { error: 'reminders failed' }
  }
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
    const reminders = await runReminders(admin)
    return NextResponse.json({ day, totals, spend, budget, over, alerted, reminders })
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

  if (task === 'reminders') return NextResponse.json(await runReminders(admin))

  return NextResponse.json({ error: 'unknown task' }, { status: 400 })
}

// Vercel Cron calls with GET. Same handler, same bearer-secret check.
export const GET = POST
