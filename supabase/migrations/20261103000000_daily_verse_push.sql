-- Daily verse (the same page for everyone, generated once a day) and web-push
-- subscriptions for the morning notification. Additive only.

create table if not exists public.daily_verses (
  day          date primary key,                       -- India calendar day
  text_source  text not null,
  book_chapter int  not null,
  verse        int  not null,
  title        text not null,
  moment       text not null,
  teaching     text not null,
  life         text not null,
  practice     text not null,
  created_at   timestamptz not null default now()
);
alter table public.daily_verses enable row level security;
-- Public content: anyone (even signed-out visitors) may read it; only the service role writes.
create policy "Daily verses are public" on public.daily_verses for select using (true);

create table if not exists public.push_subscriptions (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique check (endpoint like 'https://%' and length(endpoint) < 1000),
  p256dh     text not null check (length(p256dh) < 200),
  auth       text not null check (length(auth) < 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "Users can see their own push subscriptions" on public.push_subscriptions
  for select using ((select auth.uid()) = user_id);
create policy "Users can add their own push subscriptions" on public.push_subscriptions
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can remove their own push subscriptions" on public.push_subscriptions
  for delete using ((select auth.uid()) = user_id);
-- No update policy: a changed subscription is deleted and re-added.

-- Rollback: drop table public.push_subscriptions; drop table public.daily_verses;
