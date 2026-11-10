-- Removes remaining anon-callable public SECURITY DEFINER endpoints from the exposed public schema.
-- The public RPC contract is kept; the definer body sits in app_private, the public surface stays an invoker wrapper.

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

do $$
declare
  r record;
  v_private_definition text;
  v_call_args text;
  v_call_sql text;
  v_volatility text;
  v_wrapper_sql text;
begin
  for r in
    select
      p.oid,
      p.proname,
      p.proargtypes,
      p.pronargs,
      p.proretset,
      p.provolatile,
      pg_get_function_arguments(p.oid) as full_args,
      pg_get_function_result(p.oid) as result_type,
      pg_get_functiondef(p.oid) as function_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_community_post_reaction_summary',
        'get_effective_public_chapter_credit_config',
        'get_profile_view_access',
        'get_public_fansub_boost_bundle',
        'get_public_fansub_boost_snapshot',
        'get_public_fansub_supporter_asset_render_catalog',
        'get_public_fansub_tier_preview',
        'get_public_profile_stats',
        'get_public_user_profile_by_id',
        'get_public_user_profile_by_username',
        'list_public_fansub_boost_supporters_preview',
        'list_public_fansub_supporter_assets',
        'track_community_post_share',
        'track_community_post_view',
        'track_manga_read'
      )
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by p.proname, oidvectortypes(p.proargtypes)
  loop
    v_private_definition := regexp_replace(
      r.function_definition,
      'CREATE OR REPLACE FUNCTION public\.' || r.proname || '\(',
      'CREATE OR REPLACE FUNCTION app_private.' || r.proname || '(',
      'i'
    );

    execute v_private_definition;
    execute format(
      'grant execute on function app_private.%I(%s) to anon, authenticated, service_role',
      r.proname,
      oidvectortypes(r.proargtypes)
    );

    select string_agg('$' || i::text, ', ' order by i)
    into v_call_args
    from generate_series(1, r.pronargs) as i;

    v_call_args := coalesce(v_call_args, '');
    v_volatility := case r.provolatile
      when 'i' then 'immutable'
      when 's' then 'stable'
      else 'volatile'
    end;

    if r.proretset then
      v_call_sql := format('select * from app_private.%I(%s);', r.proname, v_call_args);
    else
      v_call_sql := format('select app_private.%I(%s);', r.proname, v_call_args);
    end if;

    v_wrapper_sql := format(
      'create or replace function public.%I(%s)
returns %s
language sql
%s
security invoker
set search_path = public
as $wrapper$
  %s
$wrapper$;',
      r.proname,
      r.full_args,
      r.result_type,
      v_volatility,
      v_call_sql
    );

    execute v_wrapper_sql;
    execute format(
      'grant execute on function public.%I(%s) to anon, authenticated',
      r.proname,
      oidvectortypes(r.proargtypes)
    );
  end loop;
end $$;
