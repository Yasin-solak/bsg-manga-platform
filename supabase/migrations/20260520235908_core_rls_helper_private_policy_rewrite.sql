-- Removes wide-surface RLS helpers from the exposed public RPC surface.
-- Public and storage policy expressions are routed to app_private helpers via metadata.

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select public.current_app_role() = 'admin';
$function$;

create or replace function app_private.can_manage_moderation_state()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select auth.role() = 'service_role' or app_private.is_admin();
$function$;

create or replace function app_private.current_public_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $function$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
    and coalesce(u.is_active, true) = true
    and coalesce(u.is_banned, false) = false
    and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
    and (
      u.active_session_id is null
      or u.active_session_id = public.current_auth_session_id()
    )
  limit 1;
$function$;

create or replace function app_private.is_fansub_admin(p_fansub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.fansub_members fm
    join public.fansubs f on f.id = fm.fansub_id
    where fm.fansub_id = p_fansub_id
      and fm.user_id = app_private.current_public_user_id()
      and fm.role = 'admin'
      and f.is_active = true
  );
$function$;

create or replace function app_private.is_fansub_staff(p_fansub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.fansub_members fm
    join public.fansubs f on f.id = fm.fansub_id
    where fm.fansub_id = p_fansub_id
      and fm.user_id = app_private.current_public_user_id()
      and fm.role in ('admin', 'moderator')
      and f.is_active = true
  );
$function$;

grant execute on function app_private.is_admin() to anon, authenticated, service_role;
grant execute on function app_private.can_manage_moderation_state() to anon, authenticated, service_role;
grant execute on function app_private.current_public_user_id() to anon, authenticated, service_role;
grant execute on function app_private.is_fansub_admin(uuid) to anon, authenticated, service_role;
grant execute on function app_private.is_fansub_staff(uuid) to anon, authenticated, service_role;

do $$
declare
  r record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for r in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      pol.polname as policy_name,
      pg_get_expr(pol.polqual, pol.polrelid) as using_expr,
      pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where pg_get_expr(pol.polqual, pol.polrelid) ~* '(public\.)?(can_manage_moderation_state|current_public_user_id|is_admin|is_fansub_admin|is_fansub_staff)[[:space:]]*\('
       or pg_get_expr(pol.polwithcheck, pol.polrelid) ~* '(public\.)?(can_manage_moderation_state|current_public_user_id|is_admin|is_fansub_admin|is_fansub_staff)[[:space:]]*\('
  loop
    v_using := r.using_expr;
    v_check := r.check_expr;

    if v_using is not null then
      v_using := regexp_replace(v_using, 'public\.can_manage_moderation_state[[:space:]]*\(', 'app_private.can_manage_moderation_state(', 'gi');
      v_using := regexp_replace(v_using, 'public\.current_public_user_id[[:space:]]*\(', 'app_private.current_public_user_id(', 'gi');
      v_using := regexp_replace(v_using, 'public\.is_fansub_admin[[:space:]]*\(', 'app_private.is_fansub_admin(', 'gi');
      v_using := regexp_replace(v_using, 'public\.is_fansub_staff[[:space:]]*\(', 'app_private.is_fansub_staff(', 'gi');
      v_using := regexp_replace(v_using, 'public\.is_admin[[:space:]]*\(', 'app_private.is_admin(', 'gi');
      v_using := regexp_replace(v_using, '(^|[^[:alnum:]_\.])can_manage_moderation_state[[:space:]]*\(', '\1app_private.can_manage_moderation_state(', 'gi');
      v_using := regexp_replace(v_using, '(^|[^[:alnum:]_\.])current_public_user_id[[:space:]]*\(', '\1app_private.current_public_user_id(', 'gi');
      v_using := regexp_replace(v_using, '(^|[^[:alnum:]_\.])is_fansub_admin[[:space:]]*\(', '\1app_private.is_fansub_admin(', 'gi');
      v_using := regexp_replace(v_using, '(^|[^[:alnum:]_\.])is_fansub_staff[[:space:]]*\(', '\1app_private.is_fansub_staff(', 'gi');
      v_using := regexp_replace(v_using, '(^|[^[:alnum:]_\.])is_admin[[:space:]]*\(', '\1app_private.is_admin(', 'gi');
    end if;

    if v_check is not null then
      v_check := regexp_replace(v_check, 'public\.can_manage_moderation_state[[:space:]]*\(', 'app_private.can_manage_moderation_state(', 'gi');
      v_check := regexp_replace(v_check, 'public\.current_public_user_id[[:space:]]*\(', 'app_private.current_public_user_id(', 'gi');
      v_check := regexp_replace(v_check, 'public\.is_fansub_admin[[:space:]]*\(', 'app_private.is_fansub_admin(', 'gi');
      v_check := regexp_replace(v_check, 'public\.is_fansub_staff[[:space:]]*\(', 'app_private.is_fansub_staff(', 'gi');
      v_check := regexp_replace(v_check, 'public\.is_admin[[:space:]]*\(', 'app_private.is_admin(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_\.])can_manage_moderation_state[[:space:]]*\(', '\1app_private.can_manage_moderation_state(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_\.])current_public_user_id[[:space:]]*\(', '\1app_private.current_public_user_id(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_\.])is_fansub_admin[[:space:]]*\(', '\1app_private.is_fansub_admin(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_\.])is_fansub_staff[[:space:]]*\(', '\1app_private.is_fansub_staff(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_\.])is_admin[[:space:]]*\(', '\1app_private.is_admin(', 'gi');
    end if;

    v_sql := format('alter policy %I on %I.%I', r.policy_name, r.schema_name, r.table_name);

    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;

    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
  end loop;
end $$;

revoke execute on function public.is_admin() from anon, authenticated, public;
revoke execute on function public.can_manage_moderation_state() from anon, authenticated, public;
revoke execute on function public.current_public_user_id() from anon, authenticated, public;
revoke execute on function public.is_fansub_admin(uuid) from anon, authenticated, public;
revoke execute on function public.is_fansub_staff(uuid) from anon, authenticated, public;

grant execute on function public.is_admin() to service_role;
grant execute on function public.can_manage_moderation_state() to service_role;
grant execute on function public.current_public_user_id() to service_role;
grant execute on function public.is_fansub_admin(uuid) to service_role;
grant execute on function public.is_fansub_staff(uuid) to service_role;
