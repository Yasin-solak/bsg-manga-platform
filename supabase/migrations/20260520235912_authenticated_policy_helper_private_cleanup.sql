-- Moves policy helpers that need not be authenticated direct RPCs to the app_private schema.
-- Community pending child and premium background storage policies keep using these helpers.

create schema if not exists app_private;

grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.can_write_pending_community_post_child(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    app_private.can_manage_moderation_state()
    or exists (
      select 1
      from public.community_posts cp
      where cp.id = p_post_id
        and cp.author_id = app_private.current_public_user_id()
        and cp.status = 'pending'
        and coalesce(cp.is_active, true) = true
    );
$function$;

create or replace function app_private.can_write_pending_community_poll_child(p_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    app_private.can_manage_moderation_state()
    or exists (
      select 1
      from public.community_post_polls cpp
      join public.community_posts cp on cp.id = cpp.post_id
      where cpp.id = p_poll_id
        and cp.author_id = app_private.current_public_user_id()
        and cp.status = 'pending'
        and coalesce(cp.is_active, true) = true
    );
$function$;

create or replace function app_private.is_current_user_premium_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.users u
    where u.id = app_private.current_public_user_id()
      and coalesce(u.is_active, true) = true
      and u.premium_expires_at is not null
      and u.premium_expires_at > now()
  );
$function$;

grant execute on function app_private.can_write_pending_community_post_child(uuid) to authenticated, service_role;
grant execute on function app_private.can_write_pending_community_poll_child(uuid) to authenticated, service_role;
grant execute on function app_private.is_current_user_premium_active() to authenticated, service_role;

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
    where pg_get_expr(pol.polqual, pol.polrelid) ~* '(public\.)?(can_write_pending_community_post_child|can_write_pending_community_poll_child|is_current_user_premium_active)[[:space:]]*\('
       or pg_get_expr(pol.polwithcheck, pol.polrelid) ~* '(public\.)?(can_write_pending_community_post_child|can_write_pending_community_poll_child|is_current_user_premium_active)[[:space:]]*\('
  loop
    v_using := r.using_expr;
    v_check := r.check_expr;

    if v_using is not null then
      v_using := regexp_replace(v_using, 'public\.can_write_pending_community_post_child[[:space:]]*\(', 'app_private.can_write_pending_community_post_child(', 'gi');
      v_using := regexp_replace(v_using, 'public\.can_write_pending_community_poll_child[[:space:]]*\(', 'app_private.can_write_pending_community_poll_child(', 'gi');
      v_using := regexp_replace(v_using, 'public\.is_current_user_premium_active[[:space:]]*\(', 'app_private.is_current_user_premium_active(', 'gi');
      v_using := regexp_replace(v_using, '(^|[^[:alnum:]_\.])can_write_pending_community_post_child[[:space:]]*\(', '\1app_private.can_write_pending_community_post_child(', 'gi');
      v_using := regexp_replace(v_using, '(^|[^[:alnum:]_\.])can_write_pending_community_poll_child[[:space:]]*\(', '\1app_private.can_write_pending_community_poll_child(', 'gi');
      v_using := regexp_replace(v_using, '(^|[^[:alnum:]_\.])is_current_user_premium_active[[:space:]]*\(', '\1app_private.is_current_user_premium_active(', 'gi');
    end if;

    if v_check is not null then
      v_check := regexp_replace(v_check, 'public\.can_write_pending_community_post_child[[:space:]]*\(', 'app_private.can_write_pending_community_post_child(', 'gi');
      v_check := regexp_replace(v_check, 'public\.can_write_pending_community_poll_child[[:space:]]*\(', 'app_private.can_write_pending_community_poll_child(', 'gi');
      v_check := regexp_replace(v_check, 'public\.is_current_user_premium_active[[:space:]]*\(', 'app_private.is_current_user_premium_active(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_\.])can_write_pending_community_post_child[[:space:]]*\(', '\1app_private.can_write_pending_community_post_child(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_\.])can_write_pending_community_poll_child[[:space:]]*\(', '\1app_private.can_write_pending_community_poll_child(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_\.])is_current_user_premium_active[[:space:]]*\(', '\1app_private.is_current_user_premium_active(', 'gi');
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

revoke execute on function public.can_write_pending_community_post_child(uuid) from anon, authenticated, public;
revoke execute on function public.can_write_pending_community_poll_child(uuid) from anon, authenticated, public;
revoke execute on function public.is_current_user_premium_active() from anon, authenticated, public;
revoke execute on function public.is_fansub_staff_of_user(uuid) from anon, authenticated, public;

grant execute on function public.can_write_pending_community_post_child(uuid) to service_role;
grant execute on function public.can_write_pending_community_poll_child(uuid) to service_role;
grant execute on function public.is_current_user_premium_active() to service_role;
grant execute on function public.is_fansub_staff_of_user(uuid) to service_role;
