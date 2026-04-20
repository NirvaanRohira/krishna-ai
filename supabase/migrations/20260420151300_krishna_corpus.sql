create table krishna_corpus (
  id            bigserial primary key,
  text_source   text        not null,
  book_chapter  integer     not null,
  verse         integer     not null,
  text          text        not null,
  theme_tags    text[]      not null default '{}',
  embedding     vector(768),
  created_at    timestamptz not null default now(),

  unique (text_source, book_chapter, verse)
);

-- ANN index for cosine similarity search (requires at least one row to build)
create index on krishna_corpus using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- GIN index for theme_tags array containment queries
create index on krishna_corpus using gin (theme_tags);

-- Fast filter by source text
create index on krishna_corpus (text_source);

alter table krishna_corpus enable row level security;

-- Public read-only (no auth required during LAND phase)
create policy "public read" on krishna_corpus
  for select using (true);
