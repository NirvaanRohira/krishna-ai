-- Fix structural_lookup so intent-keyword matching actually works at runtime, and make
-- the ashrama seed's ON CONFLICT idempotent.
--
-- Problem 1 — dead keywords. app/api/chat/route.ts extractKeywords() lowercases the user
-- message, splits on \W+, and keeps tokens >= 3 chars; queryStructuralLookup then matches
-- with .overlaps() (exact array-element equality). Seeds that were Capitalized ('Krishna',
-- 'Vrindavan', 'God') or multi-word ('who am I', 'family conflict', 'household duties')
-- could therefore NEVER match a user token. Normalize the seeded keywords into the same
-- vocabulary user input is reduced to: lowercase, split into words on any non-alphanumeric
-- run, drop tokens < 3 chars, de-duplicate. (Leftover stopword tokens are harmless — user
-- input never produces them, so they simply never match.)
UPDATE structural_lookup sl
SET intent_keywords = COALESCE((
  SELECT array_agg(DISTINCT tok)
  FROM unnest(sl.intent_keywords) AS kw,
       regexp_split_to_table(lower(kw), '[^a-z0-9]+') AS tok
  WHERE length(tok) >= 3
), ARRAY[]::text[])
WHERE intent_keywords IS NOT NULL;

-- Problem 2 — non-idempotent seed. Migration 20260526000000 uses
-- `INSERT ... ON CONFLICT DO NOTHING`, but structural_lookup has no unique constraint, so
-- the clause never fires and re-running duplicates all 12 anchors. De-duplicate any existing
-- rows by label (keep the lowest id), then add the UNIQUE(label) constraint the ON CONFLICT
-- was written to rely on. Guarded so this migration itself is safe to replay.
DELETE FROM structural_lookup a
USING structural_lookup b
WHERE a.label = b.label AND a.id > b.id;

ALTER TABLE structural_lookup DROP CONSTRAINT IF EXISTS structural_lookup_label_key;
ALTER TABLE structural_lookup ADD CONSTRAINT structural_lookup_label_key UNIQUE (label);
