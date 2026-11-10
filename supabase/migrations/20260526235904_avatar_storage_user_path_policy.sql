-- The avatar fallback upload policy must not look at public.users directly.
-- After 208 public helpers moved to app_private; storage RLS also validates the
-- active-session public user id through the same private helper.

begin;

grant usage on schema app_private to authenticated, service_role;
grant execute on function app_private.current_public_user_id() to authenticated, service_role;
grant execute on function app_private.is_admin() to authenticated, service_role;
grant execute on function app_private.is_fansub_staff(uuid) to authenticated, service_role;

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
        and (storage.foldername(name))[2] = app_private.current_public_user_id()::text
      )
      or (
        (storage.foldername(name))[1] = 'fansub-drafts'
        and (storage.foldername(name))[2] = auth.uid()::text
        and (storage.foldername(name))[3] = 'avatar'
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (storage.foldername(name))[3] = 'avatar'
        and (app_private.is_admin() or app_private.is_fansub_staff(((storage.foldername(name))[2])::uuid))
      )
      or (
        -- Old draft path: kept for remains in live clients.
        (storage.foldername(name))[1] = 'fansub-avatars'
        and owner = auth.uid()
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
      owner = auth.uid()
      or app_private.is_admin()
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (storage.foldername(name))[2] = app_private.current_public_user_id()::text
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app_private.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      owner = auth.uid()
      or app_private.is_admin()
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (storage.foldername(name))[2] = app_private.current_public_user_id()::text
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app_private.is_fansub_staff(((storage.foldername(name))[2])::uuid)
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
      owner = auth.uid()
      or app_private.is_admin()
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (storage.foldername(name))[2] = app_private.current_public_user_id()::text
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and app_private.is_fansub_staff(((storage.foldername(name))[2])::uuid)
      )
    )
  );

notify pgrst, 'reload schema';

commit;
