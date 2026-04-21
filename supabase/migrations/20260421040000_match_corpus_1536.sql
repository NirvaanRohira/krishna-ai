-- Update match_corpus RPC to accept vector(1536) after the re-dimensioning migration.
create or replace function match_corpus(
  query_embedding vector(1536),
  match_count int
)
returns table (
  id bigint,
  text_source text,
  book_chapter int,
  verse int,
  text text,
  theme_tags text[],
  similarity float
)
language sql stable
as $$
  select
    id,
    text_source,
    book_chapter,
    verse,
    text,
    theme_tags,
    1 - (embedding <=> query_embedding) as similarity
  from krishna_corpus
  order by embedding <=> query_embedding
  limit match_count;
$$;
