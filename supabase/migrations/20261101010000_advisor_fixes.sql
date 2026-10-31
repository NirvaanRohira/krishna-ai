-- Fixes from Supabase's security + performance advisors (run after 20261101000000).
-- No data changes. Same access rules as before, written in the fast form.

-- ── 1. Trigger-only functions must not be callable through the API ──────────
-- handle_new_user runs as a trigger on auth.users; Postgres checks EXECUTE only when
-- the trigger is created, so revoking it from API roles doesn't affect sign-ups
-- (proven in __tests__/db/migrations.test.ts).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- rls_auto_enable is Supabase's "enable RLS on new tables" event trigger. It exists
-- only on projects that turned that feature on, so guard it.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- ── 2. Pin search_path on the remaining functions ───────────────────────────
alter function public.match_corpus(vector, integer) set search_path = public;
alter function public.match_corpus_fts(text, integer) set search_path = public;
alter function public.set_updated_at() set search_path = public;

-- ── 3. Profile policies: (select auth.uid()) form, explicit WITH CHECK ──────
drop policy if exists "Users can view their own profile" on public.user_profiles;
create policy "Users can view their own profile" on public.user_profiles
  for select using ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile" on public.user_profiles
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own profile" on public.user_profiles;
create policy "Users can insert their own profile" on public.user_profiles
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read own spiritual profile" on public.user_spiritual_profile;
create policy "Users can read own spiritual profile" on public.user_spiritual_profile
  for select using ((select auth.uid()) = user_id);
drop policy if exists "Users can update own spiritual profile" on public.user_spiritual_profile;
create policy "Users can update own spiritual profile" on public.user_spiritual_profile
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Two identical INSERT policies existed (one added outside the repo); keep one.
drop policy if exists "Users can upsert own spiritual profile" on public.user_spiritual_profile;
drop policy if exists "Users can insert their own spiritual profile" on public.user_spiritual_profile;
create policy "Users can insert their own spiritual profile" on public.user_spiritual_profile
  for insert with check ((select auth.uid()) = user_id);

-- ── 4. Index the entitlements → plan_limits foreign key ─────────────────────
create index if not exists entitlements_plan_idx on public.entitlements (plan);

-- Rollback: grant execute back, drop and recreate the policies with auth.uid(). No data touched.
