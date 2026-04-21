create table structural_lookup (
  id           bigserial primary key,
  label        text        not null,
  intent_keywords text[]  not null,
  text_source  text        not null,
  book_chapter int         not null,
  verse_start  int         not null,
  verse_end    int         not null
);

create index on structural_lookup using gin (intent_keywords);

alter table structural_lookup enable row level security;
create policy "public read" on structural_lookup for select using (true);

-- ── Seed: 20 topic anchors ──────────────────────────────────────────
insert into structural_lookup (label, intent_keywords, text_source, book_chapter, verse_start, verse_end) values
  ('Fear of death',          array['death','die','dying','mortality','fear','afterlife','rebirth'],  'bhagavad_gita', 2, 17, 30),
  ('Grief and loss',         array['grief','sad','sorrow','loss','mourn','crying','pain','hurt'],    'bhagavad_gita', 2, 11, 16),
  ('Duty and dharma',        array['duty','dharma','obligation','responsibility','right','should'],  'bhagavad_gita', 3, 19, 19),
  ('Anger and ego',          array['anger','angry','rage','ego','pride','arrogance','control'],      'bhagavad_gita', 16, 1, 3),
  ('Detached action',        array['detach','attachment','fruits','results','action','karma','work'],'bhagavad_gita', 2, 47, 47),
  ('Nature of the self',     array['self','soul','atman','who am I','identity','consciousness'],     'bhagavad_gita', 2, 17, 25),
  ('Mind and meditation',    array['mind','thoughts','meditation','focus','concentrate','restless'], 'bhagavad_gita', 6, 5, 15),
  ('Surrender to the divine',array['surrender','trust','God','divine','let go','faith','bhakti'],   'bhagavad_gita', 18, 65, 66),
  ('Desire and attachment',  array['desire','want','crave','attachment','longing','obsess','lust'],  'bhagavad_gita', 2, 62, 63),
  ('Path of knowledge',      array['knowledge','wisdom','jnana','understand','realize','truth'],     'bhagavad_gita', 4, 33, 38),
  ('Consciousness and Brahman', array['consciousness','brahman','awareness','absolute','reality'],   'mandukya_upanishad', 1, 1, 12),
  ('Nature of Atman',        array['atman','soul','self','inner','pure','eternal','unchanging'],     'katha_upanishad', 1, 18, 25),
  ('Mind control — Yoga Sutras', array['chitta','vritti','nirodhah','mind','thoughts','citta','still'], 'yoga_sutras', 1, 2, 2),
  ('Causes of suffering',    array['suffering','pain','cause','kleshas','affliction','ignorance'],   'yoga_sutras', 2, 1, 10),
  ('Krishna childhood',      array['Krishna','childhood','Vrindavan','Yashoda','butter','Govinda'],  'bhagavatam', 10001, 1, 90),
  ('Uddhava Gita teaching',  array['Uddhava','teach','wisdom','final','counsel','renunciation'],    'bhagavatam', 11001, 1, 50),
  ('Devotion and bhakti',    array['bhakti','devotion','love','worship','prayer','dedicate'],        'bhagavad_gita', 12, 13, 20),
  ('Equanimity',             array['equanimity','balance','equal','pleasure','pain','stoic','calm'], 'bhagavad_gita', 6, 7, 9),
  ('Fear of the future',     array['future','worry','anxious','anxiety','uncertain','tomorrow'],     'bhagavad_gita', 6, 5, 6),
  ('Relationships and conflict', array['relationship','conflict','family','brother','friend','fight','argue'], 'bhagavad_gita', 1, 26, 47);
