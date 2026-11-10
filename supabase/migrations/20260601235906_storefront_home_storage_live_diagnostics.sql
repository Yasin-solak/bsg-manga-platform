-- The Storage API can return the same 42501 surface on ACL, policy and helper errors.
-- This admin-only RPC makes the live policy
-- catalog and related helper results visible in one place without exposing secret JWT values.

begin;

create schema if not exists app_private;

grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.admin_get_storefront_storage_diagnostics_impl()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $function$
declare
  v_policy_rows jsonb;
  v_private_role jsonb;
  v_private_admin jsonb;
  v_storefront_admin jsonb;
begin
  if public.current_public_user_id() is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  begin
    v_private_role := to_jsonb(app_private.current_app_role_from_jwt());
  exception
    when others then
      v_private_role := jsonb_build_object('error', sqlerrm);
  end;

  begin
    v_private_admin := to_jsonb(app_private.is_admin_from_jwt());
  exception
    when others then
      v_private_admin := jsonb_build_object('error', sqlerrm);
  end;

  begin
    v_storefront_admin := to_jsonb(app_private.can_manage_storefront_home_storage_assets_from_jwt());
  exception
    when others then
      v_storefront_admin := jsonb_build_object('error', sqlerrm);
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', p.policyname,
        'command', p.cmd,
        'roles', p.roles
      )
      order by p.policyname
    ),
    '[]'::jsonb
  )
  into v_policy_rows
  from pg_catalog.pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and (
      p.policyname ilike '%store%'
      or p.policyname ilike '%avatar%'
      or p.policyname ilike '%community%'
    );

  return jsonb_build_object(
    'jwtSubPresent', nullif(auth.jwt()->>'sub', '') is not null,
    'jwtSessionIdPresent', nullif(auth.jwt()->>'session_id', '') is not null,
    'authRole', auth.role(),
    'authUidMatchesJwtSub', auth.uid()::text = nullif(auth.jwt()->>'sub', ''),
    'publicCurrentAppRole', public.current_app_role(),
    'privateCurrentAppRoleFromJwt', v_private_role,
    'privateIsAdminFromJwt', v_private_admin,
    'storefrontStorageAdmin', v_storefront_admin,
    'authenticatedCanInsertStorageObjects',
      pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'INSERT'),
    'storefrontFolderProbe',
      (storage.foldername('storefront/smoke/probe.png'))[1] = 'storefront',
    'policies', v_policy_rows
  );
end;
$function$;

alter function app_private.admin_get_storefront_storage_diagnostics_impl() owner to postgres;

create or replace function public.admin_get_storefront_storage_diagnostics()
returns jsonb
language sql
security invoker
set search_path = public, app_private
as $function$
  select app_private.admin_get_storefront_storage_diagnostics_impl();
$function$;

revoke all on function app_private.admin_get_storefront_storage_diagnostics_impl() from public;
revoke all on function public.admin_get_storefront_storage_diagnostics() from public;

grant execute on function app_private.admin_get_storefront_storage_diagnostics_impl()
  to authenticated, service_role;
grant execute on function public.admin_get_storefront_storage_diagnostics()
  to authenticated;

notify pgrst, 'reload schema';

commit;
