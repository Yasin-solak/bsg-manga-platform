-- Storefront home images use the Supabase Storage fallback in local development.
-- Since the general store-assets admin policy can reject INSERT on live due to the helper chain,
-- a JWT-based, session-checked and narrow policy is set up
-- only for the storefront folder.

begin;

create schema if not exists app_private;

grant usage on schema app_private to authenticated, service_role;
grant usage on schema storage to authenticated, service_role;
grant select on table storage.buckets to authenticated, service_role;
grant select, insert, update, delete on table storage.objects to authenticated, service_role;

create or replace function app_private.can_manage_storefront_home_storage_assets_from_jwt()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_auth_user_id uuid;
  v_session_id uuid;
  v_sub text := nullif(auth.jwt()->>'sub', '');
  v_session text := nullif(auth.jwt()->>'session_id', '');
begin
  if v_sub is null then
    return false;
  end if;

  begin
    v_auth_user_id := v_sub::uuid;
  exception
    when others then
      return false;
  end;

  if v_session is not null then
    begin
      v_session_id := v_session::uuid;
    exception
      when others then
        return false;
    end;
  end if;

  return exists (
    select 1
    from public.users u
    where u.auth_user_id = v_auth_user_id
      and u.role = 'admin'
      and coalesce(u.is_active, true) = true
      and coalesce(u.is_banned, false) = false
      and (
        u.active_session_id is null
        or u.active_session_id = v_session_id
      )
      and not exists (
        select 1
        from public.auth_session_events e
        where e.auth_user_id = u.auth_user_id
          and e.session_id = v_session_id
          and e.revoked_at is not null
      )
  );
end;
$function$;

alter function app_private.can_manage_storefront_home_storage_assets_from_jwt() owner to postgres;

revoke all on function app_private.can_manage_storefront_home_storage_assets_from_jwt() from public;
grant execute on function app_private.can_manage_storefront_home_storage_assets_from_jwt()
  to authenticated, service_role;

drop policy if exists "Storefront home admin list assets" on storage.objects;
drop policy if exists "Storefront home admin upload assets" on storage.objects;
drop policy if exists "Storefront home admin update assets" on storage.objects;
drop policy if exists "Storefront home admin delete assets" on storage.objects;

create policy "Storefront home admin list assets"
  on storage.objects
  for select
  to authenticated
  using (
    case
      when bucket_id = 'store-assets'
        and (storage.foldername(name))[1] = 'storefront'
      then app_private.can_manage_storefront_home_storage_assets_from_jwt()
      else false
    end
  );

create policy "Storefront home admin upload assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    case
      when bucket_id = 'store-assets'
        and (storage.foldername(name))[1] = 'storefront'
      then app_private.can_manage_storefront_home_storage_assets_from_jwt()
      else false
    end
  );

create policy "Storefront home admin update assets"
  on storage.objects
  for update
  to authenticated
  using (
    case
      when bucket_id = 'store-assets'
        and (storage.foldername(name))[1] = 'storefront'
      then app_private.can_manage_storefront_home_storage_assets_from_jwt()
      else false
    end
  )
  with check (
    case
      when bucket_id = 'store-assets'
        and (storage.foldername(name))[1] = 'storefront'
      then app_private.can_manage_storefront_home_storage_assets_from_jwt()
      else false
    end
  );

create policy "Storefront home admin delete assets"
  on storage.objects
  for delete
  to authenticated
  using (
    case
      when bucket_id = 'store-assets'
        and (storage.foldername(name))[1] = 'storefront'
      then app_private.can_manage_storefront_home_storage_assets_from_jwt()
      else false
    end
  );

notify pgrst, 'reload schema';

commit;
