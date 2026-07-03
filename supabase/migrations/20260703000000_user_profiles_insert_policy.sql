-- Add the missing INSERT RLS policy on user_profiles.
--
-- Migration 20260421000000 enabled RLS and created only SELECT and UPDATE
-- policies. updateDharmaProfile upserts life_context via the user-scoped
-- (anon JWT) client, so `INSERT ... ON CONFLICT` was default-denied (42501)
-- on every session end, meaning dharma profiles never persisted.
--
-- Mirrors the correct INSERT policy already present for
-- user_spiritual_profile in migration 20260421010000.

DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;

CREATE POLICY "Users can insert their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);
