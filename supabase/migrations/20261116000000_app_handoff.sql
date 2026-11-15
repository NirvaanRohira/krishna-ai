-- Signing in to the mobile app through the website (docs/MOBILE_PLAN.md, phase 1).
--
-- The app opens the website's normal login in a browser tab. When the person is signed in and
-- has accepted the current terms, the website stores their session here under a one-time code
-- and opens the app with that code. The app redeems the code together with a PKCE verifier
-- (RFC 7636, S256) that never left the phone, so a code seen by anyone else is useless.
--
-- Security model:
--   * A row lives at most 2 minutes and is deleted when redeemed (or on a wrong verifier).
--   * Only the hash of the code is stored; the code itself exists only in the redirect.
--   * Users can insert a row for themselves only, and nobody can read the table: the only way
--     out is redeem_app_handoff(), which checks the code, the expiry and the verifier.
-- Additive only.

create table if not exists public.app_handoffs (
  code_hash     text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id       uuid not null references auth.users(id) on delete cascade,
  challenge     text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null default now() + interval '2 minutes'
                check (expires_at <= now() + interval '2 minutes'),
  created_at    timestamptz not null default now()
);

alter table public.app_handoffs enable row level security;

create policy "Users create their own app handoff" on public.app_handoffs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- No select, update or delete policies: rows leave only through redeem_app_handoff().

create or replace function public.redeem_app_handoff(p_code text, p_verifier text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h   public.app_handoffs%rowtype;
  s256 text;
begin
  -- Tidy up anything expired, so tokens never sit around.
  delete from public.app_handoffs where expires_at < now();

  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{43}$'
     or p_verifier is null or p_verifier !~ '^[A-Za-z0-9._~-]{43,128}$' then
    return null;
  end if;

  delete from public.app_handoffs
   where code_hash = encode(sha256(convert_to(p_code, 'UTF8')), 'hex')
  returning * into h;   -- single use: gone whether or not the verifier matches

  if not found then
    return null;
  end if;

  s256 := translate(rtrim(encode(sha256(convert_to(p_verifier, 'UTF8')), 'base64'), '='), '+/', '-_');
  if s256 <> h.challenge then
    return null;
  end if;

  return jsonb_build_object('access_token', h.access_token, 'refresh_token', h.refresh_token, 'user_id', h.user_id);
end;
$$;

revoke all on function public.redeem_app_handoff(text, text) from public;
grant execute on function public.redeem_app_handoff(text, text) to anon, authenticated;

-- Rollback: drop function public.redeem_app_handoff(text, text); drop table public.app_handoffs;
