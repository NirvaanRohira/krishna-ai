-- ivfflat was dropped when we moved to vector(3072) (ivfflat max is 2000 dims).
-- With 15k+ rows a sequential scan times out. HNSW supports any dimension.
-- m=16 ef_construction=64 are pgvector defaults; sufficient for 15k rows.
create index concurrently if not exists krishna_corpus_embedding_hnsw
  on krishna_corpus
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
