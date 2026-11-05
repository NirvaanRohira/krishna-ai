-- The day's verse in Hindi, for people using the Hindi interface. Same fields as the English
-- page (title, moment, teaching, life, practice), written alongside it by the morning job.
-- Nullable: older days and any day the model didn't return Hindi fall back to English.
alter table public.daily_verses add column if not exists hi jsonb;

alter table public.daily_verses drop constraint if exists daily_verses_hi_shape;
alter table public.daily_verses add constraint daily_verses_hi_shape check (
  hi is null or (jsonb_typeof(hi) = 'object' and hi ?& array['title', 'moment', 'teaching', 'life', 'practice'])
);
