-- Private account lock screen: a non-follower visitor (including signed out) opening a private profile
-- got 404. public_user_directory is security_invoker so users RLS
-- (can_read_public_user_row -> profile_visible) fully hides the private account row; the client
-- read this as "no profile".
--
-- Fix: RLS is not loosened. Only the identity the lock screen needs (id, username, display
-- name, avatar, frame) returns through a narrow RPC; only for active, unbanned, PRIVATE accounts with no
-- block between them and the visitor. Public accounts are already read from the view; a blocked or
-- inactive account still cannot be found.

create or replace function app_private.get_locked_profile_identity(p_identifier text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', u.id,
    'username', u.username,
    'display_name', coalesce(nullif(pg_catalog.btrim(u.display_name), ''), u.username),
    'avatar_url', u.avatar_url,
    'frame_type', u.frame_type
  )
  from public.users u
  where (u.username = pg_catalog.btrim(p_identifier) or u.id::text = pg_catalog.btrim(p_identifier))
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
    and u.profile_visibility = 'private'
    and not app_private.is_blocked_with_viewer(u.id)
  limit 1
$$;

revoke all on function app_private.get_locked_profile_identity(text) from public;
grant execute on function app_private.get_locked_profile_identity(text) to anon, authenticated, service_role;

create or replace function public.get_locked_profile_identity(p_identifier text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_locked_profile_identity(p_identifier)
$$;

revoke all on function public.get_locked_profile_identity(text) from public;
grant execute on function public.get_locked_profile_identity(text) to anon, authenticated;
