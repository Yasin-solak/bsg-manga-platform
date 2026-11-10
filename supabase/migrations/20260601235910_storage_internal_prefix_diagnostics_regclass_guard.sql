-- storage.prefixes does not exist in every Storage version. The direct ::regclass cast
-- in the earlier diagnostic RPC dropped the whole call when the table was absent.
-- This version resolves table oids safely with to_regclass first.

begin;

create or replace function app_private.admin_get_storage_internal_prefix_diagnostics_impl()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $function$
declare
  v_functions jsonb;
  v_prefix_table jsonb;
  v_triggers jsonb;
  v_storage_admin_exists boolean := to_regrole('supabase_storage_admin') is not null;
  v_objects_table_oid oid := to_regclass('storage.objects');
  v_prefix_table_oid oid := to_regclass('storage.prefixes');
begin
  if public.current_public_user_id() is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'signature', pg_catalog.format(
          '%I.%I(%s)',
          n.nspname,
          p.proname,
          pg_catalog.pg_get_function_identity_arguments(p.oid)
        ),
        'owner', pg_catalog.pg_get_userbyid(p.proowner),
        'securityDefiner', p.prosecdef,
        'acl', p.proacl,
        'storageAdminCanExecute', case
          when v_storage_admin_exists
          then pg_catalog.has_function_privilege('supabase_storage_admin', p.oid, 'EXECUTE')
          else null
        end
      )
      order by p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
    ),
    '[]'::jsonb
  )
  into v_functions
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'storage'
    and p.proname in (
      'add_prefixes',
      'delete_prefix',
      'delete_prefix_hierarchy_trigger',
      'get_level',
      'get_prefix',
      'get_prefixes',
      'objects_insert_prefix_trigger',
      'prefixes_insert_trigger'
    );

  if v_prefix_table_oid is not null then
    select jsonb_build_object(
      'exists', true,
      'owner', pg_catalog.pg_get_userbyid(c.relowner),
      'rowSecurityEnabled', c.relrowsecurity,
      'rowSecurityForced', c.relforcerowsecurity,
      'storageAdminCanSelect', case
        when v_storage_admin_exists
        then pg_catalog.has_table_privilege('supabase_storage_admin', c.oid, 'SELECT')
        else null
      end,
      'storageAdminCanInsert', case
        when v_storage_admin_exists
        then pg_catalog.has_table_privilege('supabase_storage_admin', c.oid, 'INSERT')
        else null
      end,
      'storageAdminCanUpdate', case
        when v_storage_admin_exists
        then pg_catalog.has_table_privilege('supabase_storage_admin', c.oid, 'UPDATE')
        else null
      end,
      'storageAdminCanDelete', case
        when v_storage_admin_exists
        then pg_catalog.has_table_privilege('supabase_storage_admin', c.oid, 'DELETE')
        else null
      end
    )
    into v_prefix_table
    from pg_catalog.pg_class c
    where c.oid = v_prefix_table_oid;
  else
    v_prefix_table := jsonb_build_object('exists', false);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'table', t.tgrelid::regclass::text,
        'name', t.tgname,
        'internal', t.tgisinternal,
        'enabled', t.tgenabled,
        'function', t.tgfoid::regprocedure::text,
        'functionOwner', pg_catalog.pg_get_userbyid(p.proowner),
        'definition', pg_catalog.pg_get_triggerdef(t.oid, true)
      )
      order by t.tgrelid::regclass::text, t.tgname
    ),
    '[]'::jsonb
  )
  into v_triggers
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = v_objects_table_oid
    or t.tgrelid = v_prefix_table_oid;

  return jsonb_build_object(
    'storageAdminRoleExists', v_storage_admin_exists,
    'storageAdminHasSchemaUsage', case
      when v_storage_admin_exists
      then pg_catalog.has_schema_privilege('supabase_storage_admin', 'storage', 'USAGE')
      else null
    end,
    'prefixTable', v_prefix_table,
    'functions', v_functions,
    'triggers', v_triggers
  );
end;
$function$;

alter function app_private.admin_get_storage_internal_prefix_diagnostics_impl() owner to postgres;

notify pgrst, 'reload schema';

commit;
