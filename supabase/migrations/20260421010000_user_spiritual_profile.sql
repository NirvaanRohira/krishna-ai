-- user_spiritual_profile: Dharma Profile — accumulates across sessions
-- user_profiles also needs life_context, previous_guidance, and last_session_summary columns

CREATE TABLE IF NOT EXISTS user_spiritual_profile (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_attachments  text[]   DEFAULT '{}',
  current_life_stage   text,
  recurring_themes     text[]   DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS life_context          text,
  ADD COLUMN IF NOT EXISTS previous_guidance     jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS last_session_summary  text;

-- RLS for user_spiritual_profile
ALTER TABLE user_spiritual_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own spiritual profile"
  ON user_spiritual_profile FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own spiritual profile"
  ON user_spiritual_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own spiritual profile"
  ON user_spiritual_profile FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypass for background extraction (runs server-side without user JWT)
CREATE POLICY "Service role bypass spiritual profile"
  ON user_spiritual_profile
  USING (auth.jwt() ->> 'role' = 'service_role');
