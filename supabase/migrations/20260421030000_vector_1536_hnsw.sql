-- Re-dimension embeddings from vector(3072) to vector(1536).
-- gemini-embedding-001 with outputDimensionality=1536 fits under pgvector's 2000-dim index cap.
-- Dropping and re-adding the column nullifies all existing embeddings; the reembed script repopulates them.
-- Text, theme_tags, and all other row data are preserved.

ALTER TABLE krishna_corpus DROP COLUMN embedding;
ALTER TABLE krishna_corpus ADD COLUMN embedding vector(1536);

-- HNSW supports any dimension and gives sub-10ms ANN search at 15k rows.
CREATE INDEX krishna_corpus_embedding_hnsw
  ON krishna_corpus
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
