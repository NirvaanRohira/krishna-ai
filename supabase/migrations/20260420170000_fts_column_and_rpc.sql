-- Add FTS column for sparse keyword retrieval (pg_search unavailable on free tier)
ALTER TABLE krishna_corpus
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(text, ''))) STORED;

CREATE INDEX IF NOT EXISTS krishna_corpus_fts_idx ON krishna_corpus USING GIN (fts);

CREATE OR REPLACE FUNCTION match_corpus_fts(
  query_text text,
  match_count int
)
RETURNS TABLE (
  id bigint,
  text_source text,
  book_chapter int,
  verse int,
  text text,
  theme_tags text[],
  rank float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    text_source,
    book_chapter,
    verse,
    text,
    theme_tags,
    ts_rank(fts, plainto_tsquery('simple', query_text))::float AS rank
  FROM krishna_corpus
  WHERE fts @@ plainto_tsquery('simple', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
$$;
