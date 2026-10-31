-- Security, privacy and performance hardening (Oct 2026 audit).
-- Safe to run on the live DB: only adds indexes/columns/tables and replaces policies.
-- Rollback notes are at the bottom.

-- ── 1. Indexes for the hot paths ────────────────────────────────────────────
-- Every chat turn reads recent messages by session, and every RLS check on messages
-- looks up sessions by user. Neither had an index (FKs aren't indexed automatically).
create index if not exists messages_session_created_idx on public.messages (session_id, created_at desc);
create index if not exists sessions_user_started_idx on public.sessions (user_id, started_at desc);

-- ── 2. RLS: faster and stricter ─────────────────────────────────────────────
-- `(select auth.uid())` is evaluated once per statement instead of once per row
-- (Supabase's documented RLS performance fix). Explicit WITH CHECK on writes.
drop policy if exists "Users can manage their own sessions" on public.sessions;
create policy "Users can manage their own sessions" on public.sessions
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Messages are an append-only transcript: read + insert only. Users can no longer edit
-- stored assistant turns (which are fed back into prompts as history). Deleting the
-- session cascades to its messages for account erasure.
drop policy if exists "Users can manage messages in their sessions" on public.messages;
create policy "Users can read messages in their sessions" on public.messages
  for select
  using (exists (select 1 from public.sessions s where s.id = messages.session_id and s.user_id = (select auth.uid())));
create policy "Users can add messages to their open sessions" on public.messages
  for insert
  with check (exists (
    select 1 from public.sessions s
    where s.id = messages.session_id and s.user_id = (select auth.uid()) and s.ended_at is null
  ));

-- Right to erasure (DPDP Act s.12): users must be able to delete their own profile rows.
drop policy if exists "Users can delete their own profile" on public.user_profiles;
create policy "Users can delete their own profile" on public.user_profiles
  for delete using ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own spiritual profile" on public.user_spiritual_profile;
create policy "Users can delete own spiritual profile" on public.user_spiritual_profile
  for delete using ((select auth.uid()) = user_id);

-- The service role bypasses RLS anyway; this policy did nothing but confuse audits.
drop policy if exists "Service role bypass spiritual profile" on public.user_spiritual_profile;

-- ── 3. Pin search_path on functions (prevents search_path hijacking) ────────
alter function public.handle_new_user() set search_path = public;
alter function public.increment_session_turn(uuid) set search_path = public;

-- ── 4. Race-free memory append ──────────────────────────────────────────────
-- Replaces a read-modify-write in app code that could drop an entry when two sessions
-- ended at once. The UPDATE's row lock serialises concurrent appends. Keeps the newest
-- p_keep entries so the array (and the prompt built from it) can't grow forever.
create or replace function public.append_previous_guidance(p_entry jsonb, p_keep int default 20)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.user_profiles up
     set previous_guidance = (
       select coalesce(jsonb_agg(x.e order by x.ord), '[]'::jsonb)
         from (
           select t.e, t.ord
             from jsonb_array_elements(coalesce(up.previous_guidance, '[]'::jsonb) || jsonb_build_array(p_entry))
                  with ordinality as t(e, ord)
            order by t.ord desc
            limit greatest(p_keep, 1)
         ) x
     )
   where up.user_id = (select auth.uid());
$$;

-- ── 5. Consent & age (DPDP Act 2023 + DPDP Rules) ───────────────────────────
alter table public.user_profiles
  add column if not exists age_confirmed_18_plus boolean not null default false,
  add column if not exists terms_version text,
  add column if not exists privacy_version text,
  add column if not exists consented_at timestamptz,
  add column if not exists marketing_opt_in boolean not null default false;

-- Append-only consent ledger: proof of what each user agreed to, and when.
-- Withdrawals are new rows (granted = false), never updates.
create table if not exists public.consent_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('terms', 'privacy', 'age_18_plus', 'ai_disclosure', 'marketing', 'voice_processing')),
  version    text not null,
  granted    boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists consent_events_user_idx on public.consent_events (user_id, created_at desc);
alter table public.consent_events enable row level security;
create policy "Users can read their consent history" on public.consent_events
  for select using ((select auth.uid()) = user_id);
create policy "Users can record their own consent" on public.consent_events
  for insert with check ((select auth.uid()) = user_id);
-- No update/delete policies: the ledger is immutable to users (erasure happens via the
-- auth.users cascade when the account itself is deleted).

-- Rollback: drop the new policies/index/table/function/columns above and re-create the
-- original policies from 20260420180000_sessions_and_messages.sql. No data is rewritten.
