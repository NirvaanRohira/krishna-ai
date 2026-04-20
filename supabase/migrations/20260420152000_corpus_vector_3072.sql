-- text-embedding-004 (768-dim) no longer exists; gemini-embedding-001 produces 3072 dimensions.
-- ivfflat max is 2000 dims, so we skip it for now; at 700 rows sequential scan is fast.
drop index if exists krishna_corpus_embedding_idx;

alter table krishna_corpus
  alter column embedding type vector(3072);
