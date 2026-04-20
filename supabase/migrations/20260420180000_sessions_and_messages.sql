CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  turn_count int DEFAULT 0
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sessions"
  ON sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  retrieval_context jsonb,
  grounding_passed boolean,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage messages in their sessions"
  ON messages FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION increment_session_turn(p_session_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE sessions SET turn_count = turn_count + 1 WHERE id = p_session_id;
$$;
