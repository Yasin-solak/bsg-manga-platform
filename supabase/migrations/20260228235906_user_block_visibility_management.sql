-- ============================================
-- MangaZone | User blocking visibility and management hardening
-- Date: 2026-02-28
-- ============================================

begin;

create or replace function public.list_blocked_users()
returns table (
  blocked_id uuid,
  username text,
  avatar_url text,
  blocked_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    ub.blocked_id,
    u.username,
    u.avatar_url,
    ub.created_at as blocked_at
  from public.user_blocks ub
  join public.users u
    on u.id = ub.blocked_id
  where ub.blocker_id = public.current_public_user_id()
  order by ub.created_at desc;
$$;

revoke all on function public.list_blocked_users() from public;
grant execute on function public.list_blocked_users() to authenticated;

drop policy if exists users_select_active on public.users;
create policy users_select_active
  on public.users
  for select
  using (
    public.is_admin()
    or id = public.current_public_user_id()
    or (
      is_active = true
      and not public.is_user_blocked_between(id, public.current_public_user_id())
    )
  );

drop policy if exists user_manga_lists_select_rule on public.user_manga_lists;
create policy user_manga_lists_select_rule
  on public.user_manga_lists
  for select
  using (
    public.is_admin()
    or owner_id = public.current_public_user_id()
    or (
      is_public = true
      and not public.is_user_blocked_between(owner_id, public.current_public_user_id())
    )
  );

commit;
