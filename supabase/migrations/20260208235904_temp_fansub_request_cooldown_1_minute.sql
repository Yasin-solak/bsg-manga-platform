-- Temporary test setting:
-- The fansub request cooldown drops from 24 hours to 1 minute.
-- This setting must be reverted when tests finish.

create or replace function public.can_create_fansub_request_daily(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.fansub_requests fr
    where fr.requester_user_id = p_user_id
      and fr.created_at >= now() - interval '1 minute'
      and fr.is_active = true
  );
$$;

grant execute on function public.can_create_fansub_request_daily(uuid) to authenticated;
