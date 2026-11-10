-- ============================================
-- MangaZone | User block helper security fix
-- Date: 2026-02-28
-- ============================================

begin;

create or replace function public.is_user_blocked_between(p_left_user_id uuid, p_right_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_left_user_id is null or p_right_user_id is null then false
      else exists (
        select 1
        from public.user_blocks ub
        where (ub.blocker_id = p_left_user_id and ub.blocked_id = p_right_user_id)
           or (ub.blocker_id = p_right_user_id and ub.blocked_id = p_left_user_id)
      )
    end
$$;

revoke all on function public.is_user_blocked_between(uuid, uuid) from public;
grant execute on function public.is_user_blocked_between(uuid, uuid) to anon, authenticated;

commit;
