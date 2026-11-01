-- save_exchange inserted the seeker's message and the reply in one transaction, so both got
-- the same now() and "order by created_at" could return the reply before the question.
-- Reloaded conversations then read back to the model out of order.
-- Fix: the reply is stamped one microsecond after the question; existing pairs are repaired.

create or replace function public.save_exchange(
  p_session_id uuid, p_user_message text, p_assistant_message text,
  p_sources jsonb default '[]'::jsonb, p_grounding_passed boolean default true
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  t timestamptz := clock_timestamp();
begin
  insert into public.messages (session_id, role, content, created_at) values (p_session_id, 'user', p_user_message, t);
  insert into public.messages (session_id, role, content, retrieval_context, grounding_passed, created_at)
    values (p_session_id, 'assistant', p_assistant_message, p_sources, p_grounding_passed, t + interval '1 microsecond');
  update public.sessions set turn_count = turn_count + 1 where id = p_session_id;
end;
$$;

-- Repair: where a reply shares its timestamp with the seeker's message, move it just after.
update public.messages a
   set created_at = a.created_at + interval '1 microsecond'
 where a.role = 'assistant'
   and exists (
     select 1 from public.messages u
      where u.session_id = a.session_id and u.role = 'user' and u.created_at = a.created_at
   );
