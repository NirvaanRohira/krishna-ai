-- Razorpay payments: one-time plan passes (30 or 365 days, no auto-renewal).
-- Additive only: safe to apply before deploying the matching code.
--
-- Security model:
--   * Prices, plan and duration are decided on the server and stored on the order row
--     when the order is created. The client only names a product.
--   * Users can READ their own payments but never write them. Rows are created and
--     settled only by the server with the service role (order route, verify route,
--     webhook), so nobody can mark their own order as paid.
--   * apply_payment is idempotent: the same payment arriving from the browser, the
--     webhook, and a webhook retry extends the plan exactly once.

create table if not exists public.payments (
  order_id     text primary key,                       -- Razorpay order id (order_...)
  user_id      uuid not null references auth.users(id) on delete cascade,
  sku          text not null,
  plan         text not null references public.plan_limits(plan),
  days         int  not null check (days between 1 and 400),
  amount_paise int  not null check (amount_paise >= 100),
  currency     text not null default 'INR',
  status       text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  payment_id   text unique,                             -- Razorpay payment id (pay_...)
  created_at   timestamptz not null default now(),
  paid_at      timestamptz,
  refunded_at  timestamptz
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
alter table public.payments enable row level security;
create policy "Users can read their own payments" on public.payments
  for select using ((select auth.uid()) = user_id);
-- No insert/update/delete policies: only the service role writes here.

-- Webhook deliveries already handled (Razorpay retries, and can deliver out of order).
create table if not exists public.payment_events (
  event_id    text primary key,                         -- x-razorpay-event-id header
  event       text not null,
  received_at timestamptz not null default now()
);
alter table public.payment_events enable row level security;  -- no policies: service role only

-- ── apply_payment ───────────────────────────────────────────────────────────
-- Marks an order paid and extends the user's plan. Safe to call many times.
-- Rules:
--   * Same plan still active → add the days to the current end date.
--   * Different plan still active → keep the higher plan, and add the days to the later end date.
--   * A manual grant with no end date is never shortened or downgraded.
--   * Nothing active → the plan starts now.
create or replace function public.apply_payment(p_order_id text, p_payment_id text, p_amount_paise int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p          public.payments%rowtype;
  e          public.entitlements%rowtype;
  has_ent    boolean;
  active     boolean;
  rank_new   int;
  rank_cur   int;
  new_plan   text;
  new_until  timestamptz;
begin
  select * into p from public.payments where order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_order');
  end if;
  if p.status = 'paid' then
    if p.payment_id is distinct from p_payment_id then
      return jsonb_build_object('ok', false, 'reason', 'order_already_paid');
    end if;
    return jsonb_build_object('ok', true, 'already', true, 'plan', p.plan);
  end if;
  if p.status = 'refunded' then
    return jsonb_build_object('ok', false, 'reason', 'refunded');
  end if;
  if p_amount_paise is distinct from p.amount_paise then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  update public.payments
     set status = 'paid', payment_id = p_payment_id, paid_at = now()
   where order_id = p_order_id;

  select * into e from public.entitlements where user_id = p.user_id for update;
  has_ent := found;
  active := has_ent and e.plan <> 'free' and (e.valid_until is null or e.valid_until > now());
  rank_new := case p.plan when 'premium' then 2 when 'plus' then 1 else 0 end;
  rank_cur := case when active then (case e.plan when 'premium' then 2 when 'plus' then 1 else 0 end) else 0 end;

  if active and e.valid_until is null then
    -- Permanent grant (e.g. a tester): never shorten it; upgrade only if the purchase is higher.
    if rank_cur >= rank_new then
      return jsonb_build_object('ok', true, 'plan', e.plan, 'valid_until', null);
    end if;
    new_plan := p.plan;
    new_until := now() + make_interval(days => p.days);
  elsif active then
    new_plan := case when rank_new >= rank_cur then p.plan else e.plan end;
    new_until := greatest(e.valid_until, now()) + make_interval(days => p.days);
  else
    new_plan := p.plan;
    new_until := now() + make_interval(days => p.days);
  end if;

  insert into public.entitlements as en (user_id, plan, valid_until, source, updated_at)
  values (p.user_id, new_plan, new_until, 'razorpay', now())
  on conflict (user_id) do update
    set plan = excluded.plan, valid_until = excluded.valid_until, source = 'razorpay', updated_at = now();

  return jsonb_build_object('ok', true, 'plan', new_plan, 'valid_until', new_until);
end;
$$;

-- A failed attempt only marks an unpaid order; it never touches a paid one.
create or replace function public.mark_payment_failed(p_order_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.payments set status = 'failed' where order_id = p_order_id and status = 'created';
$$;

-- Full refund: mark the payment refunded and take back the days it bought (never below now).
create or replace function public.refund_payment(p_payment_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where payment_id = p_payment_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_payment'); end if;
  if p.status = 'refunded' then return jsonb_build_object('ok', true, 'already', true); end if;
  if p.status <> 'paid' then return jsonb_build_object('ok', false, 'reason', 'not_paid'); end if;

  update public.payments set status = 'refunded', refunded_at = now() where order_id = p.order_id;
  update public.entitlements
     set valid_until = greatest(now(), valid_until - make_interval(days => p.days)), updated_at = now()
   where user_id = p.user_id and source = 'razorpay' and valid_until is not null;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.apply_payment(text, text, int) from public, anon, authenticated;
grant execute on function public.apply_payment(text, text, int) to service_role;
revoke all on function public.mark_payment_failed(text) from public, anon, authenticated;
grant execute on function public.mark_payment_failed(text) to service_role;
revoke all on function public.refund_payment(text) from public, anon, authenticated;
grant execute on function public.refund_payment(text) to service_role;

-- Rollback: drop the three functions and the two tables. Nothing existing is altered.
