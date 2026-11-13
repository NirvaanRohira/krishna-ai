-- Speech-to-text burst limit, enforced in Postgres.
-- It was an in-memory counter per server instance, so on Vercel (many instances) it wasn't
-- exact. Same pattern as consume_quota: the user comes from auth.uid(), never a parameter,
-- and the counter lives in rate_windows (functions only, no policies).
-- Additive only: safe to apply before deploying the matching code.

alter table public.plan_limits add column if not exists stt_requests_per_min int not null default 20;

create or replace function public.consume_burst(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_plan  text;
  v_limit int;
  v_min   timestamptz := date_trunc('minute', now());
  n       int;
begin
  if uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  end if;
  if p_kind is distinct from 'stt' then
    raise exception 'invalid burst kind';
  end if;

  select e.plan into v_plan from public.entitlements e
   where e.user_id = uid and (e.valid_until is null or e.valid_until > now());
  v_plan := coalesce(v_plan, 'free');
  select stt_requests_per_min into v_limit from public.plan_limits where plan = v_plan;
  v_limit := coalesce(v_limit, 20);

  insert into public.rate_windows as rw (user_id, kind, window_start, count)
  values (uid, 'stt', v_min, 1)
  on conflict (user_id, kind) do update
     set count = case when rw.window_start = v_min then rw.count + 1 else 1 end,
         window_start = v_min
  returning count into n;

  if n > v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'plan', v_plan, 'limit', v_limit,
      'retry_after', greatest(1, 60 - floor(extract(second from now()))::int));
  end if;
  return jsonb_build_object('allowed', true, 'reason', 'ok', 'plan', v_plan, 'limit', v_limit);
end;
$$;

revoke all on function public.consume_burst(text) from public, anon;
grant execute on function public.consume_burst(text) to authenticated;

-- Rollback: drop function public.consume_burst(text);
--           alter table public.plan_limits drop column stt_requests_per_min;
