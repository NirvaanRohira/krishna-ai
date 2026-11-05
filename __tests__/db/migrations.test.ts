// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, asUser } from './pg'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const D_OTHER = '44444444-4444-4444-8444-444444444444'

let db: PGlite

beforeAll(async () => {
  db = await freshDb()
  await db.query('insert into auth.users (id, email) values ($1, $2), ($3, $4)', [A, 'a@x.in', B, 'b@x.in'])
}, 60_000)

describe('migrations', () => {
  it('apply cleanly in order and create a profile row per new user (trigger)', async () => {
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from user_profiles')
    expect(rows[0].n).toBe(2)
  })
})

describe('row-level security', () => {
  it('a user can only see their own sessions and messages (no IDOR)', async () => {
    const sA = await asUser(db, A, () => db.query<{ id: string }>('insert into sessions (user_id) values ($1) returning id', [A]))
    const sessionA = sA.rows[0].id
    await asUser(db, A, () => db.query(`insert into messages (session_id, role, content) values ($1, 'user', 'my secret')`, [sessionA]))

    const seenByB = await asUser(db, B, () => db.query('select * from messages'))
    expect(seenByB.rows).toHaveLength(0)
    const sessionsByB = await asUser(db, B, () => db.query('select * from sessions'))
    expect(sessionsByB.rows).toHaveLength(0)
    // B cannot write into A's session
    await expect(asUser(db, B, () => db.query(`insert into messages (session_id, role, content) values ($1, 'user', 'x')`, [sessionA]))).rejects.toThrow()
    // B cannot create a session owned by A
    await expect(asUser(db, B, () => db.query('insert into sessions (user_id) values ($1)', [A]))).rejects.toThrow()
  })

  it('messages are append-only: users cannot edit stored assistant turns', async () => {
    const s = await asUser(db, A, () => db.query<{ id: string }>('insert into sessions (user_id) values ($1) returning id', [A]))
    await asUser(db, A, () => db.query(`insert into messages (session_id, role, content) values ($1, 'assistant', 'original')`, [s.rows[0].id]))
    await asUser(db, A, () => db.query(`update messages set content = 'FORGED' where session_id = $1`, [s.rows[0].id]))
    const r = await db.query<{ content: string }>('select content from messages where session_id = $1', [s.rows[0].id])
    expect(r.rows[0].content).toBe('original')
  })

  it('no new messages can be added to an ended session', async () => {
    const s = await asUser(db, A, () => db.query<{ id: string }>('insert into sessions (user_id, ended_at) values ($1, now()) returning id', [A]))
    await expect(asUser(db, A, () => db.query(`insert into messages (session_id, role, content) values ($1, 'user', 'late')`, [s.rows[0].id]))).rejects.toThrow()
  })

  it('anonymous visitors see the public corpus but no user data', async () => {
    const r = await asUser(db, null, () => db.query('select * from user_profiles'))
    expect(r.rows).toHaveLength(0)
    await expect(asUser(db, null, () => db.query('select count(*) from krishna_corpus'))).resolves.toBeTruthy()
  })
})

describe('memory + consent', () => {
  it('append_previous_guidance appends atomically and keeps only the newest N', async () => {
    await asUser(db, A, async () => {
      for (let i = 0; i < 5; i++) await db.query(`select append_previous_guidance($1::jsonb, 3)`, [JSON.stringify({ topic: `t${i}` })])
    })
    const r = await db.query<{ g: { topic: string }[] }>('select previous_guidance as g from user_profiles where user_id = $1', [A])
    expect(r.rows[0].g.map((x) => x.topic)).toEqual(['t2', 't3', 't4'])
  })

  it('consent ledger is insert-only for users and private to them', async () => {
    await asUser(db, A, () => db.query(`insert into consent_events (user_id, kind, version, granted) values ($1, 'terms', 'v1', true)`, [A]))
    await expect(asUser(db, A, () => db.query(`insert into consent_events (user_id, kind, version, granted) values ($1, 'terms', 'v1', true)`, [B]))).rejects.toThrow()
    await asUser(db, A, () => db.query(`delete from consent_events where user_id = $1`, [A]))
    const left = await db.query('select * from consent_events where user_id = $1', [A])
    expect(left.rows.length).toBeGreaterThan(0)
    const seenByB = await asUser(db, B, () => db.query('select * from consent_events'))
    expect(seenByB.rows).toHaveLength(0)
  })

  it('users can erase their own profile rows', async () => {
    await asUser(db, B, () => db.query('delete from user_profiles where user_id = $1', [B]))
    const r = await db.query('select * from user_profiles where user_id = $1', [B])
    expect(r.rows).toHaveLength(0)
  })
})

describe('quotas and rate limits (enforced in Postgres)', () => {
  const C = '33333333-3333-4333-8333-333333333333'
  beforeAll(async () => {
    await db.query('insert into auth.users (id) values ($1)', [C])
  })
  const consume = (uid: string, kind: string, amount = 1) =>
    asUser(db, uid, async () => (await db.query<{ r: { allowed: boolean; reason: string; plan: string } }>('select consume_quota($1, $2) as r', [kind, amount])).rows[0].r)

  it('free plan: allows 6 messages a minute then rate-limits', async () => {
    const results = []
    for (let i = 0; i < 7; i++) results.push(await consume(C, 'message'))
    expect(results.slice(0, 6).every((r) => r.allowed)).toBe(true)
    expect(results[6]).toMatchObject({ allowed: false, reason: 'rate', plan: 'free' })
  })

  it('free plan: stops at 10 messages a day', async () => {
    await db.query(`update rate_windows set window_start = now() - interval '5 minutes' where user_id = $1`, [C])
    const more = []
    for (let i = 0; i < 5; i++) {
      await db.query(`update rate_windows set window_start = now() - interval '5 minutes' where user_id = $1`, [C])
      more.push(await consume(C, 'message'))
    }
    // 6 counted so far (the rate-limited 7th call used no daily quota) → 4 more reach 10
    expect(more.slice(0, 4).every((r) => r.allowed)).toBe(true)
    expect(more[4]).toMatchObject({ allowed: false, reason: 'daily' })
  })

  it('voice characters are capped per day', async () => {
    expect((await consume(C, 'voice_chars', 2500)).allowed).toBe(true)
    expect((await consume(C, 'voice_chars', 600)).allowed).toBe(false)
    expect((await consume(C, 'voice_chars', 400)).allowed).toBe(true)
  })

  it('a paid plan raises the limits; users cannot grant themselves a plan or reset usage', async () => {
    await expect(asUser(db, C, () => db.query(`insert into entitlements (user_id, plan) values ($1, 'premium')`, [C]))).rejects.toThrow()
    await asUser(db, C, () => db.query('delete from usage_daily where user_id = $1', [C]))
    await asUser(db, C, () => db.query('update usage_daily set messages = 0 where user_id = $1', [C]))
    const r = await db.query<{ messages: number }>('select messages from usage_daily where user_id = $1', [C])
    expect(r.rows[0].messages).toBe(10)

    await db.query(`insert into entitlements (user_id, plan) values ($1, 'plus')`, [C]) // as the payments webhook would
    await db.query(`update rate_windows set window_start = now() - interval '5 minutes' where user_id = $1`, [C])
    expect(await consume(C, 'message')).toMatchObject({ allowed: true, plan: 'plus' })
  })

  it('anonymous callers cannot use quota functions; only the service role sees totals', async () => {
    await expect(asUser(db, null, () => db.query(`select consume_quota('message', 1)`))).rejects.toThrow()
    await expect(asUser(db, C, () => db.query('select * from usage_totals(current_date)'))).rejects.toThrow()
    await db.exec('set role service_role')
    const t = await db.query<{ messages: number }>(`select * from usage_totals((now() at time zone 'Asia/Kolkata')::date)`)
    await db.exec('reset role')
    expect(Number(t.rows[0].messages)).toBeGreaterThan(0)
  })
})

describe('chat turn, memory clearing, retention', () => {
  const D = '44444444-4444-4444-8444-444444444444'
  beforeAll(async () => { await db.query('insert into auth.users (id) values ($1)', [D]) })

  it('save_exchange writes both messages and bumps the turn count atomically', async () => {
    const s = await asUser(db, D, () => db.query<{ id: string }>('insert into sessions (user_id) values ($1) returning id', [D]))
    await asUser(db, D, () => db.query(`select save_exchange($1, 'q', 'a', '[{"verse":1}]'::jsonb, true)`, [s.rows[0].id]))
    const m = await db.query('select role from messages where session_id = $1 order by role', [s.rows[0].id])
    const t = await db.query<{ turn_count: number }>('select turn_count from sessions where id = $1', [s.rows[0].id])
    expect(m.rows).toHaveLength(2)
    expect(t.rows[0].turn_count).toBe(1)
  })

  it('save_exchange stores the reply after the question, so history reads back in order (20261104000000)', async () => {
    const s = await asUser(db, D, () => db.query<{ id: string }>('insert into sessions (user_id) values ($1) returning id', [D]))
    for (const n of [1, 2, 3]) await asUser(db, D, () => db.query(`select save_exchange($1, $2, $3)`, [s.rows[0].id, `q${n}`, `a${n}`]))
    const m = await db.query<{ content: string }>('select content from messages where session_id = $1 order by created_at', [s.rows[0].id])
    expect(m.rows.map((r) => r.content)).toEqual(['q1', 'a1', 'q2', 'a2', 'q3', 'a3'])
  })

  it('save_exchange into someone else’s session fails and writes nothing', async () => {
    const s = await asUser(db, A, () => db.query<{ id: string }>('insert into sessions (user_id) values ($1) returning id', [A]))
    await expect(asUser(db, D, () => db.query(`select save_exchange($1, 'q', 'a')`, [s.rows[0].id]))).rejects.toThrow()
    const m = await db.query('select * from messages where session_id = $1', [s.rows[0].id])
    expect(m.rows).toHaveLength(0)
  })

  it('clear_my_memory wipes only the caller’s remembered profile', async () => {
    await db.query(`update user_profiles set life_context = 'secret' where user_id in ($1, $2)`, [D, A])
    await asUser(db, D, () => db.query('select clear_my_memory()'))
    const r = await db.query<{ user_id: string; life_context: string | null }>('select user_id, life_context from user_profiles where user_id in ($1, $2)', [D, A])
    expect(r.rows.find((x) => x.user_id === D)?.life_context).toBeNull()
    expect(r.rows.find((x) => x.user_id === A)?.life_context).toBe('secret')
  })

  it('purge_old_data deletes conversations older than the retention window (service role only)', async () => {
    await db.query(`insert into sessions (user_id, started_at) values ($1, now() - interval '14 months')`, [D])
    await expect(asUser(db, D, () => db.query('select purge_old_data(12)'))).rejects.toThrow()
    await db.exec('set role service_role')
    const r = await db.query<{ r: { sessions_deleted: number } }>('select purge_old_data(12) as r')
    await db.exec('reset role')
    expect(r.rows[0].r.sessions_deleted).toBe(1)
  })
})

describe('advisor fixes (20261101010000)', () => {
  it('sign-up still creates a profile after handle_new_user is locked to trigger-only', async () => {
    // Mimic Supabase's auth service: a non-superuser role that inserts into auth.users.
    await db.exec(`create role auth_admin_sim nologin; grant usage on schema auth to auth_admin_sim; grant insert on auth.users to auth_admin_sim;`)
    const NEW = '55555555-5555-4555-8555-555555555555'
    await db.exec('set role auth_admin_sim')
    await db.query('insert into auth.users (id, email) values ($1, $2)', [NEW, 'new@x.in'])
    await db.exec('reset role')
    const r = await db.query('select 1 from user_profiles where user_id = $1', [NEW])
    expect(r.rows).toHaveLength(1)
  })

  it('API roles can no longer call handle_new_user directly', async () => {
    const r = await db.query<{ anon: boolean; authed: boolean }>(
      `select has_function_privilege('anon', 'public.handle_new_user()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') as authed`)
    expect(r.rows[0]).toEqual({ anon: false, authed: false })
  })

  it('profile policies keep the same rules: own row only, cannot reassign a row to someone else', async () => {
    const mine = await asUser(db, A, () => db.query('select user_id from user_profiles'))
    expect(mine.rows).toEqual([{ user_id: A }])
    await asUser(db, A, () => db.query('update user_profiles set user_id = $1 where user_id = $2', [D_OTHER, A]).catch(() => null))
    const still = await db.query('select 1 from user_profiles where user_id = $1', [A])
    expect(still.rows).toHaveLength(1)
  })
})

describe('payments (20261102000000)', () => {
  const P = '66666666-6666-4666-8666-666666666666'
  const Q = '77777777-7777-4777-8777-777777777777'
  beforeAll(async () => {
    await db.query('insert into auth.users (id) values ($1), ($2)', [P, Q])
  })
  const asService = async <T>(fn: () => Promise<T>) => {
    await db.exec('set role service_role')
    try { return await fn() } finally { await db.exec('reset role') }
  }
  const newOrder = (order: string, user: string, plan = 'plus', days = 30, amount = 19900) =>
    asService(() => db.query('insert into payments (order_id, user_id, sku, plan, days, amount_paise) values ($1,$2,$3,$4,$5,$6)', [order, user, `${plan}_${days}`, plan, days, amount]))
  const apply = (order: string, pay: string, amount: number) =>
    asService(async () => (await db.query<{ r: { ok: boolean; reason?: string; plan?: string; valid_until?: string; already?: boolean } }>('select apply_payment($1,$2,$3) as r', [order, pay, amount])).rows[0].r)
  const ent = async (user: string) => (await db.query<{ plan: string; valid_until: string | null }>('select plan, valid_until from entitlements where user_id = $1', [user])).rows[0]
  const daysLeft = (iso: string | null) => Math.round((new Date(iso!).getTime() - Date.now()) / 86_400_000)

  it('a verified payment grants the plan, and applying it again changes nothing (idempotent)', async () => {
    await newOrder('order_P1', P)
    expect(await apply('order_P1', 'pay_P1', 19900)).toMatchObject({ ok: true, plan: 'plus' })
    expect(daysLeft((await ent(P)).valid_until)).toBe(30)
    expect(await apply('order_P1', 'pay_P1', 19900)).toMatchObject({ ok: true, already: true })
    expect(daysLeft((await ent(P)).valid_until)).toBe(30)
    // A different payment id cannot re-use a paid order
    expect(await apply('order_P1', 'pay_OTHER', 19900)).toMatchObject({ ok: false, reason: 'order_already_paid' })
  })

  it('buying the same plan again extends from the current end date', async () => {
    await newOrder('order_P2', P)
    await apply('order_P2', 'pay_P2', 19900)
    expect(daysLeft((await ent(P)).valid_until)).toBe(60)
  })

  it('upgrading to Premium switches plan and keeps the remaining time', async () => {
    await newOrder('order_P3', P, 'premium', 30, 49900)
    expect(await apply('order_P3', 'pay_P3', 49900)).toMatchObject({ ok: true, plan: 'premium' })
    const e = await ent(P)
    expect(e.plan).toBe('premium')
    expect(daysLeft(e.valid_until)).toBe(90)
  })

  it('rejects a wrong amount and unknown orders, and grants nothing', async () => {
    await newOrder('order_Q1', Q)
    expect(await apply('order_Q1', 'pay_Q1', 100)).toMatchObject({ ok: false, reason: 'amount_mismatch' })
    expect(await apply('order_NOPE', 'pay_Q1', 19900)).toMatchObject({ ok: false, reason: 'unknown_order' })
    expect(await ent(Q)).toBeUndefined()
  })

  it('a permanent grant is never shortened by a purchase', async () => {
    await db.query(`insert into entitlements (user_id, plan, source) values ($1, 'premium', 'grant')`, [Q])
    await newOrder('order_Q2', Q)
    expect(await apply('order_Q2', 'pay_Q2', 19900)).toMatchObject({ ok: true, plan: 'premium' })
    expect(await ent(Q)).toMatchObject({ plan: 'premium', valid_until: null })
  })

  it('a refund marks the payment and takes back its days', async () => {
    const r = await asService(async () => (await db.query<{ r: { ok: boolean } }>(`select refund_payment('pay_P3') as r`)).rows[0].r)
    expect(r.ok).toBe(true)
    expect(daysLeft((await ent(P)).valid_until)).toBe(60)
    const again = await asService(async () => (await db.query<{ r: { already?: boolean } }>(`select refund_payment('pay_P3') as r`)).rows[0].r)
    expect(again.already).toBe(true)
  })

  it('users can read only their own payments and can never write payments or plans', async () => {
    const mine = await asUser(db, P, () => db.query('select order_id from payments order by order_id'))
    expect(mine.rows.map((r) => (r as { order_id: string }).order_id)).toEqual(['order_P1', 'order_P2', 'order_P3'])
    const theirs = await asUser(db, Q, () => db.query(`select * from payments where user_id = $1`, [P]))
    expect(theirs.rows).toHaveLength(0)
    await expect(asUser(db, P, () => db.query(`insert into payments (order_id, user_id, sku, plan, days, amount_paise) values ('order_X', $1, 'x', 'premium', 400, 100)`, [P]))).rejects.toThrow()
    await asUser(db, Q, () => db.query(`update payments set status = 'paid' where order_id = 'order_Q1'`))
    expect((await db.query<{ status: string }>(`select status from payments where order_id = 'order_Q1'`)).rows[0].status).toBe('created')
    await expect(asUser(db, P, () => db.query(`select apply_payment('order_Q1', 'pay_Z', 19900)`))).rejects.toThrow()
    await expect(asUser(db, P, () => db.query(`select refund_payment('pay_P1')`))).rejects.toThrow()
    await expect(asUser(db, null, () => db.query(`select mark_payment_failed('order_Q1')`))).rejects.toThrow()
    await expect(asUser(db, P, () => db.query(`select * from payment_events`))).resolves.toMatchObject({ rows: [] })
  })

  it('consume_quota honours a purchased plan until it expires', async () => {
    const r = await asUser(db, P, async () => (await db.query<{ r: { plan: string } }>(`select consume_quota('message') as r`)).rows[0].r)
    expect(r.plan).toBe('premium')
    await db.query(`update entitlements set valid_until = now() - interval '1 minute' where user_id = $1`, [P])
    const after = await asUser(db, P, async () => (await db.query<{ r: { plan: string } }>(`select consume_quota('message') as r`)).rows[0].r)
    expect(after.plan).toBe('free')
  })
})

describe('daily verse and push (20261103000000)', () => {
  const U = '88888888-8888-4888-8888-888888888888'
  const V = '99999999-9999-4999-8999-999999999999'
  beforeAll(async () => {
    await db.query('insert into auth.users (id) values ($1), ($2)', [U, V])
  })

  it('anyone can read the daily verse; nobody but the service role can write it', async () => {
    await db.exec('set role service_role')
    await db.query(`insert into daily_verses (day, text_source, book_chapter, verse, title, moment, teaching, life, practice) values ('2026-11-02','bhagavad_gita',2,47,'t','m','te','l','p')`)
    await db.exec('reset role')
    const anon = await asUser(db, null, () => db.query('select title from daily_verses'))
    expect(anon.rows).toHaveLength(1)
    await expect(asUser(db, U, () => db.query(`insert into daily_verses (day, text_source, book_chapter, verse, title, moment, teaching, life, practice) values ('2026-11-03','bhagavad_gita',2,48,'t','m','te','l','p')`))).rejects.toThrow()
    await asUser(db, U, () => db.query(`update daily_verses set title = 'HACKED'`))
    expect((await db.query<{ title: string }>(`select title from daily_verses`)).rows[0].title).toBe('t')
  })

  it('the Hindi page is optional, must have every field when present, and is readable like the rest (20261105000000)', async () => {
    await db.exec('set role service_role')
    await db.query(`insert into daily_verses (day, text_source, book_chapter, verse, title, moment, teaching, life, practice, hi) values ('2026-11-04','bhagavad_gita',2,48,'t','m','te','l','p', '{"title":"शी","moment":"प्र","teaching":"शि","life":"जी","practice":"अ"}')`)
    await expect(db.query(`insert into daily_verses (day, text_source, book_chapter, verse, title, moment, teaching, life, practice, hi) values ('2026-11-05','bhagavad_gita',2,49,'t','m','te','l','p', '{"title":"only a title"}')`)).rejects.toThrow()
    await db.exec('reset role')
    const anon = await asUser(db, null, () => db.query<{ hi: { title: string } }>(`select hi from daily_verses where day = '2026-11-04'`))
    expect(anon.rows[0].hi.title).toBe('शी')
  })

  it('users manage only their own push subscriptions, and only https endpoints', async () => {
    await asUser(db, U, () => db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/abc', 'k', 'a')`, [U]))
    await expect(asUser(db, U, () => db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/x', 'k', 'a')`, [V]))).rejects.toThrow()
    await expect(asUser(db, U, () => db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'http://169.254.169.254/latest', 'k', 'a')`, [U]))).rejects.toThrow()
    expect((await asUser(db, V, () => db.query('select * from push_subscriptions'))).rows).toHaveLength(0)
    await asUser(db, V, () => db.query('delete from push_subscriptions'))
    expect((await db.query('select * from push_subscriptions')).rows).toHaveLength(1)
  })
})
