-- Removes public SECURITY DEFINER RPC bodies open to the authenticated role from the exposed public schema.
-- The public signature is kept; the public function becomes an invoker wrapper, the privileged body an app_private function.

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

alter default privileges for role postgres in schema app_private
  revoke execute on functions from public;

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
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
      pg_get_function_arguments(p.oid) as full_args,
      pg_get_function_result(p.oid) as result_type,
      pg_get_functiondef(p.oid) as function_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosecdef
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
      and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
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
      'revoke execute on function app_private.%I(%s) from public, anon, authenticated',
      r.proname,
      oidvectortypes(r.proargtypes)
    );
    execute format(
      'grant execute on function app_private.%I(%s) to service_role',
      r.proname,
      oidvectortypes(r.proargtypes)
    );

    if r.anon_execute then
      execute format(
        'grant execute on function app_private.%I(%s) to anon',
        r.proname,
        oidvectortypes(r.proargtypes)
      );
    end if;

    if r.authenticated_execute then
      execute format(
        'grant execute on function app_private.%I(%s) to authenticated',
        r.proname,
        oidvectortypes(r.proargtypes)
      );
    end if;

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
      'revoke execute on function public.%I(%s) from public, anon, authenticated',
      r.proname,
      oidvectortypes(r.proargtypes)
    );

    if r.anon_execute then
      execute format(
        'grant execute on function public.%I(%s) to anon',
        r.proname,
        oidvectortypes(r.proargtypes)
      );
    end if;

    if r.authenticated_execute then
      execute format(
        'grant execute on function public.%I(%s) to authenticated',
        r.proname,
        oidvectortypes(r.proargtypes)
      );
    end if;
  end loop;
end $$;
