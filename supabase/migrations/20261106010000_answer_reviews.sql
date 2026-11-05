-- The spiritual reviewer's verdicts on replies that opened a page of scripture.
-- Written by the daily job (service role) only; nobody reads it through the API (RLS on, no
-- policies). Reviews go with their message: deleting a conversation or an account deletes them.
create table if not exists public.answer_reviews (
  message_id  uuid primary key references public.messages(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  verdict     text not null check (verdict in ('ok', 'concern', 'serious')),
  flags       jsonb not null default '{}'::jsonb,
  notes       text check (length(notes) <= 1000),
  model       text
);
create index if not exists answer_reviews_verdict_idx on public.answer_reviews (verdict, reviewed_at desc);
alter table public.answer_reviews enable row level security;
-- Rollback: drop table public.answer_reviews;
