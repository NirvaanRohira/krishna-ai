-- "Report this reply": people can flag an AI reply as harmful, offensive or wrong (Google Play's
-- AI-generated content policy requires an in-app way to do this; the website has it too).
--
-- Security model:
--   * Users can only file reports as themselves, only about their own conversations, and only
--     as 'open'. Nobody but the service role can read, change or delete reports (the owner reviews
--     them in the Supabase dashboard).
--   * The reported text is taken from the stored message when it can be matched (verified = true);
--     otherwise it is the text the person saw, kept for review but marked unverified.
--   * At most 30 reports per person per day, enforced here so it holds across server instances.
--   * Reports go with the account (on delete cascade), like everything else.
-- Additive only.

create table if not exists public.reply_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id    uuid references public.sessions(id) on delete set null,
  message_id    uuid references public.messages(id) on delete set null,
  reason        text not null check (reason in ('harmful', 'offensive', 'wrong', 'other')),
  note          text check (note is null or char_length(note) <= 1000),
  reply_excerpt text not null check (char_length(reply_excerpt) between 1 and 4000),
  verified      boolean not null default false,
  source        text not null default 'web' check (source in ('web', 'android', 'ios')),
  status        text not null default 'open' check (status in ('open', 'reviewed', 'actioned')),
  created_at    timestamptz not null default now()
);

create index if not exists reply_reports_open_idx on public.reply_reports (created_at desc) where status = 'open';
create index if not exists reply_reports_user_idx on public.reply_reports (user_id, created_at);

alter table public.reply_reports enable row level security;

create policy "Users report replies in their own conversations" on public.reply_reports
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'open'
    and (session_id is null or exists (
      select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid())
    ))
  );
-- No select, update or delete policies: only the service role reads and triages reports.

create or replace function public.reply_reports_daily_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.reply_reports
       where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'report limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.reply_reports_daily_cap() from public, anon, authenticated;

create trigger reply_reports_daily_cap
  before insert on public.reply_reports
  for each row execute function public.reply_reports_daily_cap();

-- Rollback: drop table public.reply_reports; drop function public.reply_reports_daily_cap();
