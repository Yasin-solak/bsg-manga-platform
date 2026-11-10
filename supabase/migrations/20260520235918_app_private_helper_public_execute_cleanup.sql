-- No PUBLIC EXECUTE default must remain on app_private helper and definer bodies.
-- Explicit EXECUTE is given to API roles needed for RLS/policy calls.

alter default privileges for role postgres in schema app_private
  revoke execute on functions from public;

do $$
declare
  r record;
begin
  for r in
    select p.proname, p.proargtypes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.prosecdef
      and has_function_privilege('public', p.oid, 'EXECUTE')
    order by p.proname, oidvectortypes(p.proargtypes)
  loop
    execute format(
      'revoke execute on function app_private.%I(%s) from public',
      r.proname,
      oidvectortypes(r.proargtypes)
    );

    execute format(
      'grant execute on function app_private.%I(%s) to anon, authenticated, service_role',
      r.proname,
      oidvectortypes(r.proargtypes)
    );
  end loop;
end $$;
