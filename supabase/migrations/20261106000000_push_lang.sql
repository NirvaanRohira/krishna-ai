-- The morning notification in the language the person uses the app in.
alter table public.push_subscriptions add column if not exists lang text not null default 'en';
alter table public.push_subscriptions drop constraint if exists push_subscriptions_lang_check;
alter table public.push_subscriptions add constraint push_subscriptions_lang_check check (lang in ('en', 'hi'));
-- Rollback: alter table public.push_subscriptions drop column lang;
