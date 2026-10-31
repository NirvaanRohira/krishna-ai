-- Plans, durable rate limits and daily quotas, usage metering for spend alerts, an atomic
-- save for each chat turn, user-controlled memory clearing, and data retention.
-- Additive only: safe to apply to the live DB before deploying the matching code.
--
-- Security model: users can READ their own plan and usage, but can never write them.
-- Every counter changes only inside SECURITY DEFINER functions that take the user from
-- auth.uid() (never from a parameter), so nobody can reset or raise their own limits.

-- ── Plans ───────────────────────────────────────────────────────────────────
create table if not exists public.plan_limits (
  plan                 text primary key,
  messages_per_day     int not null,
  voice_chars_per_day  int not null,
  messages_per_minute  int not null,
  tts_requests_per_min int not null
);
insert into public.plan_limits (plan, messages_per_day, voice_chars_per_day, messages_per_minute, tts_requests_per_min) values
  ('free',     10,  3000,  6, 30),
  ('plus',     40, 12000, 10, 60),
  ('premium', 150, 50000, 15, 90)
on conflict (plan) do nothing;  -- edit limits later with plain UPDATEs, not by re-running this
alter table public.plan_limits enable row level security;
create policy "Plan limits are public" on public.plan_limits for select using (true);

create table if not exists public.entitlements (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  plan        text not null default 'free' references public.plan_limits(plan),
  valid_until timestamptz,
  source      text,               -- 'razorpay' | 'play' | 'appstore' | 'grant'
  updated_at  timestamptz not null default now()
);
alter table public.entitlements enable row level security;
create policy "Users can read their own plan" on public.entitlements
  for select using ((select auth.uid()) = user_id);
-- No insert/update policy: only the payments webhook (service role) grants plans.

-- ── Usage ───────────────────────────────────────────────────────────────────
create table if not exists public.usage_daily (
  user_id        uuid not null references auth.users(id) on delete cascade,
  day            date not null,     -- India calendar day (Asia/Kolkata)
  messages       int not null default 0,
  voice_chars    int not null default 0,
  llm_in_tokens  bigint not null default 0,
  llm_out_tokens bigint not null default 0,
  primary key (user_id, day)
);
create index if not exists usage_daily_day_idx on public.usage_daily (day);
alter table public.usage_daily enable row level security;
create policy "Users can read their own usage" on public.usage_daily
  for select using ((select auth.uid()) = user_id);

-- One row per (user, kind): a fixed one-minute window for burst limiting. Bounded size.
create table if not exists public.rate_windows (
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null,
  window_start timestamptz not null,
  count        int not null,
  primary key (user_id, kind)
);
alter table public.rate_windows enable row level security;  -- no policies: functions only

-- ── consume_quota ───────────────────────────────────────────────────────────
-- p_kind: 'message' (amount ignored, counts 1) | 'voice_chars' (amount = characters).
-- Returns { allowed, reason, plan, limit, used }. reason ∈ ok | rate | daily | unauthenticated.
create or replace function public.consume_quota(p_kind text, p_amount int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_plan text;
  lim    public.plan_limits%rowtype;
  v_day  date := (now() at time zone 'Asia/Kolkata')::date;
  v_min  timestamptz := date_trunc('minute', now());
  burst_kind text;
  burst_limit int;
  burst_count int;
  used   int;
begin
  if uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  end if;
  if p_kind not in ('message', 'voice_chars') or p_amount < 0 or p_amount > 10000 then
    raise exception 'invalid quota request';
  end if;

  select e.plan into v_plan from public.entitlements e
   where e.user_id = uid and (e.valid_until is null or e.valid_until > now());
  v_plan := coalesce(v_plan, 'free');
  select * into lim from public.plan_limits where plan = v_plan;

  -- Burst limit (per minute)
  burst_kind  := case when p_kind = 'message' then 'message' else 'tts' end;
  burst_limit := case when p_kind = 'message' then lim.messages_per_minute else lim.tts_requests_per_min end;
  insert into public.rate_windows as rw (user_id, kind, window_start, count)
  values (uid, burst_kind, v_min, 1)
  on conflict (user_id, kind) do update
     set count = case when rw.window_start = v_min then rw.count + 1 else 1 end,
         window_start = v_min
  returning count into burst_count;
  if burst_count > burst_limit then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'plan', v_plan, 'limit', burst_limit);
  end if;

  -- Daily quota. The conditional UPDATE is atomic, so concurrent requests can't overshoot.
  if p_kind = 'message' then
    insert into public.usage_daily as u (user_id, day, messages) values (uid, v_day, 1)
    on conflict (user_id, day) do update set messages = u.messages + 1
      where u.messages < lim.messages_per_day
    returning messages into used;
    if used is null then
      return jsonb_build_object('allowed', false, 'reason', 'daily', 'plan', v_plan, 'limit', lim.messages_per_day);
    end if;
    return jsonb_build_object('allowed', true, 'reason', 'ok', 'plan', v_plan, 'limit', lim.messages_per_day, 'used', used);
  else
    insert into public.usage_daily as u (user_id, day, voice_chars) values (uid, v_day, p_amount)
    on conflict (user_id, day) do update set voice_chars = u.voice_chars + p_amount
      where u.voice_chars + p_amount <= lim.voice_chars_per_day
    returning voice_chars into used;
    if used is null or used > lim.voice_chars_per_day then
      return jsonb_build_object('allowed', false, 'reason', 'daily', 'plan', v_plan, 'limit', lim.voice_chars_per_day);
    end if;
    return jsonb_build_object('allowed', true, 'reason', 'ok', 'plan', v_plan, 'limit', lim.voice_chars_per_day, 'used', used);
  end if;
end;
$$;

-- Token metering for spend monitoring (estimates are fine; this drives alerts, not billing).
create or replace function public.record_llm_usage(p_in_tokens int, p_out_tokens int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.usage_daily as u (user_id, day, llm_in_tokens, llm_out_tokens)
  select auth.uid(), (now() at time zone 'Asia/Kolkata')::date,
         least(greatest(p_in_tokens, 0), 200000), least(greatest(p_out_tokens, 0), 50000)
  where auth.uid() is not null
  on conflict (user_id, day) do update
    set llm_in_tokens = u.llm_in_tokens + excluded.llm_in_tokens,
        llm_out_tokens = u.llm_out_tokens + excluded.llm_out_tokens;
$$;

-- Aggregate totals for the spend-alert job. Service role only.
create or replace function public.usage_totals(p_day date)
returns table (active_users bigint, messages bigint, voice_chars bigint, llm_in_tokens bigint, llm_out_tokens bigint)
language sql
security definer
set search_path = public
as $$
  select count(*), coalesce(sum(messages), 0), coalesce(sum(voice_chars), 0),
         coalesce(sum(llm_in_tokens), 0), coalesce(sum(llm_out_tokens), 0)
    from public.usage_daily where day = p_day;
$$;

-- ── Atomic chat turn ────────────────────────────────────────────────────────
-- Both messages and the turn counter commit together or not at all. SECURITY INVOKER,
-- so RLS still decides whether the caller may write to this session.
create or replace function public.save_exchange(
  p_session_id uuid, p_user_message text, p_assistant_message text,
  p_sources jsonb default '[]'::jsonb, p_grounding_passed boolean default true
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.messages (session_id, role, content) values (p_session_id, 'user', p_user_message);
  insert into public.messages (session_id, role, content, retrieval_context, grounding_passed)
    values (p_session_id, 'assistant', p_assistant_message, p_sources, p_grounding_passed);
  update public.sessions set turn_count = turn_count + 1 where id = p_session_id;
end;
$$;

-- ── "What Kanha remembers" — user can wipe it in one step ───────────────────
create or replace function public.clear_my_memory()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.user_profiles
     set life_context = null, previous_guidance = '[]'::jsonb, last_session_summary = null
   where user_id = (select auth.uid());
  delete from public.user_spiritual_profile where user_id = (select auth.uid());
end;
$$;

-- ── Retention (DPDP: don't keep data longer than the purpose needs) ─────────
-- Deletes conversations older than p_months (messages cascade) and old usage rows.
-- The user's profile summary stays while the account exists; account deletion removes all.
-- Schedule daily with pg_cron (see docs/RUNBOOK.md). Service role only.
create or replace function public.purge_old_data(p_months int default 12)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n_sessions int; n_usage int;
begin
  if p_months < 1 then raise exception 'p_months must be >= 1'; end if;
  delete from public.sessions where started_at < now() - make_interval(months => p_months);
  get diagnostics n_sessions = row_count;
  delete from public.usage_daily where day < (now() - make_interval(months => p_months + 1))::date;
  get diagnostics n_usage = row_count;
  return jsonb_build_object('sessions_deleted', n_sessions, 'usage_rows_deleted', n_usage);
end;
$$;

-- ── Privileges: definer functions are callable only by the right roles ──────
revoke all on function public.consume_quota(text, int) from public, anon;
grant execute on function public.consume_quota(text, int) to authenticated;
revoke all on function public.record_llm_usage(int, int) from public, anon;
grant execute on function public.record_llm_usage(int, int) to authenticated;
revoke all on function public.usage_totals(date) from public, anon, authenticated;
grant execute on function public.usage_totals(date) to service_role;
revoke all on function public.purge_old_data(int) from public, anon, authenticated;
grant execute on function public.purge_old_data(int) to service_role;

-- Rollback: drop the functions and the four tables above. Nothing existing is altered.
