-- In live diagnosis the app_private.current_public_user_id_from_jwt() call
-- gave `permission denied for table users` under the authenticated role.
-- This shows the helper chain behaves like invoker rather than definer on the Storage side.
-- This migration re-establishes helper functions
-- as SECURITY DEFINER.

begin;

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

create or replace function app_private.current_auth_user_id_from_jwt()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  v_sub text := nullif(auth.jwt()->>'sub', '');
begin
  if v_sub is null then
    return null;
  end if;

  begin
    return v_sub::uuid;
  exception
    when others then
      return null;
  end;
end;
$function$;

create or replace function app_private.current_public_user_id_from_jwt()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $function$
  select u.id
  from public.users u
  where u.auth_user_id = app_private.current_auth_user_id_from_jwt()
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
    and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
    and (
      u.active_session_id is null
      or u.active_session_id = public.current_auth_session_id()
    )
  limit 1;
$function$;

create or replace function app_private.current_app_role_from_jwt()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  v_role text;
begin
  if app_private.current_auth_user_id_from_jwt() is null then
    return 'anon';
  end if;

  select u.role
  into v_role
  from public.users u
  where u.auth_user_id = app_private.current_auth_user_id_from_jwt()
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
    and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
    and (
      u.active_session_id is null
      or u.active_session_id = public.current_auth_session_id()
    )
  limit 1;

  return coalesce(v_role, 'user');
end;
$function$;

create or replace function app_private.is_admin_from_jwt()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $function$
  select app_private.current_app_role_from_jwt() = 'admin';
$function$;

create or replace function app_private.is_fansub_staff_from_jwt(p_fansub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $function$
  select exists (
    select 1
    from public.fansub_members fm
    join public.fansubs f on f.id = fm.fansub_id
    where fm.fansub_id = p_fansub_id
      and fm.user_id = app_private.current_public_user_id_from_jwt()
      and fm.role in ('admin', 'moderator')
      and f.is_active = true
  );
$function$;

create or replace function app_private.can_write_pending_community_post_child_from_jwt(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $function$
  select
    app_private.is_admin_from_jwt()
    or exists (
      select 1
      from public.community_posts cp
      where cp.id = p_post_id
        and cp.author_id = app_private.current_public_user_id_from_jwt()
        and cp.status = 'pending'
        and coalesce(cp.is_active, true) = true
    );
$function$;

revoke all on function app_private.current_auth_user_id_from_jwt() from public;
revoke all on function app_private.current_public_user_id_from_jwt() from public;
revoke all on function app_private.current_app_role_from_jwt() from public;
revoke all on function app_private.is_admin_from_jwt() from public;
revoke all on function app_private.is_fansub_staff_from_jwt(uuid) from public;
revoke all on function app_private.can_write_pending_community_post_child_from_jwt(uuid) from public;

grant execute on function app_private.current_auth_user_id_from_jwt() to anon, authenticated, service_role;
grant execute on function app_private.current_public_user_id_from_jwt() to anon, authenticated, service_role;
grant execute on function app_private.current_app_role_from_jwt() to anon, authenticated, service_role;
grant execute on function app_private.is_admin_from_jwt() to anon, authenticated, service_role;
grant execute on function app_private.is_fansub_staff_from_jwt(uuid) to authenticated, service_role;
grant execute on function app_private.can_write_pending_community_post_child_from_jwt(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
