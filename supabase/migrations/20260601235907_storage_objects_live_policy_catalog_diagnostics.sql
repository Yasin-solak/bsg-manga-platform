-- If the Storage API gives INSERT 42501 while the storefront helper returns true
-- seeing only related policy names is not enough. This admin-only diagnostic
-- RPC reports all storage.objects policies, bucket limits and table
-- triggers without exposing token values.

begin;

create schema if not exists app_private;

grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.admin_get_storage_objects_policy_catalog_impl()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $function$
declare
  v_policies jsonb;
  v_buckets jsonb;
  v_constraints jsonb;
  v_triggers jsonb;
  v_table_state jsonb;
begin
  if public.current_public_user_id() is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', p.policyname,
        'permissive', p.permissive,
        'roles', p.roles,
        'command', p.cmd,
        'using', p.qual,
        'withCheck', p.with_check
      )
      order by p.policyname
    ),
    '[]'::jsonb
  )
  into v_policies
  from pg_catalog.pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'public', b.public,
        'fileSizeLimit', b.file_size_limit,
        'allowedMimeTypes', b.allowed_mime_types
      )
      order by b.id
    ),
    '[]'::jsonb
  )
  into v_buckets
  from storage.buckets b
  where b.id in ('store-assets', 'avatars');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', c.conname,
        'type', c.contype,
        'definition', pg_catalog.pg_get_constraintdef(c.oid, true)
      )
      order by c.conname
    ),
    '[]'::jsonb
  )
  into v_constraints
  from pg_catalog.pg_constraint c
  where c.conrelid = 'storage.objects'::regclass;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', t.tgname,
        'enabled', t.tgenabled,
        'definition', pg_catalog.pg_get_triggerdef(t.oid, true)
      )
      order by t.tgname
    ),
    '[]'::jsonb
  )
  into v_triggers
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'storage.objects'::regclass
    and not t.tgisinternal;

  select jsonb_build_object(
    'rowSecurityEnabled', c.relrowsecurity,
    'rowSecurityForced', c.relforcerowsecurity,
    'authenticatedCanSelect', pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'SELECT'),
    'authenticatedCanInsert', pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'INSERT'),
    'authenticatedCanUpdate', pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'UPDATE'),
    'authenticatedCanDelete', pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'DELETE')
  )
  into v_table_state
  from pg_catalog.pg_class c
  where c.oid = 'storage.objects'::regclass;

  return jsonb_build_object(
    'table', v_table_state,
    'buckets', v_buckets,
    'policies', v_policies,
    'constraints', v_constraints,
    'triggers', v_triggers
  );
end;
$function$;

alter function app_private.admin_get_storage_objects_policy_catalog_impl() owner to postgres;

create or replace function public.admin_get_storage_objects_policy_catalog()
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $function$
  select app_private.admin_get_storage_objects_policy_catalog_impl();
$function$;

revoke all on function app_private.admin_get_storage_objects_policy_catalog_impl() from public;
revoke all on function public.admin_get_storage_objects_policy_catalog() from public;

grant execute on function app_private.admin_get_storage_objects_policy_catalog_impl()
  to authenticated, service_role;
grant execute on function public.admin_get_storage_objects_policy_catalog()
  to authenticated;

notify pgrst, 'reload schema';

commit;
