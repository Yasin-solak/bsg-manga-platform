-- In the Supabase Storage policy context JWT sub is used instead of auth.uid()
-- as the identity source. The official Storage sample also builds folder-based upload checks
-- via auth.jwt()->>'sub'. This migration realigns storage-focused helpers and
-- policies with this semantic.

begin;

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

create or replace function app_private.current_auth_user_id_from_jwt()
returns uuid
language plpgsql
stable
security definer
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
as $function$
  select app_private.current_app_role_from_jwt() = 'admin';
$function$;

create or replace function app_private.is_fansub_staff_from_jwt(p_fansub_id uuid)
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
set search_path = public
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

grant execute on function app_private.current_auth_user_id_from_jwt() to anon, authenticated, service_role;
grant execute on function app_private.current_public_user_id_from_jwt() to anon, authenticated, service_role;
grant execute on function app_private.current_app_role_from_jwt() to anon, authenticated, service_role;
grant execute on function app_private.is_admin_from_jwt() to anon, authenticated, service_role;
grant execute on function app_private.is_fansub_staff_from_jwt(uuid) to authenticated, service_role;
grant execute on function app_private.can_write_pending_community_post_child_from_jwt(uuid) to authenticated, service_role;

drop policy if exists "Admin upload store assets" on storage.objects;
drop policy if exists "Admin update store assets" on storage.objects;
drop policy if exists "Admin delete store assets" on storage.objects;

create policy "Admin upload store assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-assets'
    and app_private.is_admin_from_jwt()
  );

create policy "Admin update store assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'store-assets'
    and app_private.is_admin_from_jwt()
  )
  with check (
    bucket_id = 'store-assets'
    and app_private.is_admin_from_jwt()
  );

create policy "Admin delete store assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'store-assets'
    and app_private.is_admin_from_jwt()
  );

drop policy if exists "Scoped upload avatars" on storage.objects;
drop policy if exists "Scoped update avatars" on storage.objects;
drop policy if exists "Scoped delete avatars" on storage.objects;

create policy "Scoped upload avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          (storage.foldername(name))[2] = app_private.current_auth_user_id_from_jwt()::text
          or (storage.foldername(name))[2] = app_private.current_public_user_id_from_jwt()::text
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansub-drafts'
        and (storage.foldername(name))[2] = app_private.current_auth_user_id_from_jwt()::text
        and (storage.foldername(name))[3] = 'avatar'
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (storage.foldername(name))[3] = 'avatar'
        and (
          app_private.is_admin_from_jwt()
          or app_private.is_fansub_staff_from_jwt(((storage.foldername(name))[2])::uuid)
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansub-avatars'
        and (storage.foldername(name))[2] = app_private.current_auth_user_id_from_jwt()::text
      )
    )
  );

create policy "Scoped update avatars"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      coalesce(owner_id, owner::text) = app_private.current_auth_user_id_from_jwt()::text
      or app_private.is_admin_from_jwt()
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          (storage.foldername(name))[2] = app_private.current_auth_user_id_from_jwt()::text
          or (storage.foldername(name))[2] = app_private.current_public_user_id_from_jwt()::text
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app_private.is_fansub_staff_from_jwt(((storage.foldername(name))[2])::uuid)
      )
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      coalesce(owner_id, owner::text) = app_private.current_auth_user_id_from_jwt()::text
      or app_private.is_admin_from_jwt()
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          (storage.foldername(name))[2] = app_private.current_auth_user_id_from_jwt()::text
          or (storage.foldername(name))[2] = app_private.current_public_user_id_from_jwt()::text
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app_private.is_fansub_staff_from_jwt(((storage.foldername(name))[2])::uuid)
      )
    )
  );

create policy "Scoped delete avatars"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      coalesce(owner_id, owner::text) = app_private.current_auth_user_id_from_jwt()::text
      or app_private.is_admin_from_jwt()
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          (storage.foldername(name))[2] = app_private.current_auth_user_id_from_jwt()::text
          or (storage.foldername(name))[2] = app_private.current_public_user_id_from_jwt()::text
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app_private.is_fansub_staff_from_jwt(((storage.foldername(name))[2])::uuid)
      )
    )
  );

drop policy if exists "Community post image upload own posts" on storage.objects;
drop policy if exists "Community post image upload own pending posts" on storage.objects;

create policy "Community post image upload own pending posts"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'community'
    and (storage.foldername(name))[2] = 'posts'
    and coalesce((storage.foldername(name))[4], '') ~ '^slot-0[1-4]$'
    and case
      when coalesce((storage.foldername(name))[3], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then app_private.can_write_pending_community_post_child_from_jwt(((storage.foldername(name))[3])::uuid)
      else false
    end
  );

notify pgrst, 'reload schema';

commit;
