-- Avatar upload clients can use two folder identities during the transition:
-- auth uid and legacy public users.id. Keep the auth uid path in a helperless fast branch,
-- move to the SECURITY DEFINER helper fallback only on the legacy folder path.

begin;

drop policy if exists "Scoped upload avatars" on storage.objects;

create policy "Scoped upload avatars"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and case
      when (storage.foldername(name))[1] = 'user-avatars' then
        coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and case
          when (storage.foldername(name))[2] = (select auth.jwt() ->> 'sub') then true
          else (storage.foldername(name))[2] = (
            select app_private.current_public_user_id_from_jwt()::text
          )
        end
      when (storage.foldername(name))[1] = 'fansub-drafts' then
        (storage.foldername(name))[2] = (select auth.jwt() ->> 'sub')
        and (storage.foldername(name))[3] = 'avatar'
      when (storage.foldername(name))[1] = 'fansub-avatars' then
        (storage.foldername(name))[2] = (select auth.jwt() ->> 'sub')
      when (storage.foldername(name))[1] = 'fansubs' then
        coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (storage.foldername(name))[3] = 'avatar'
        and (
          app_private.is_admin_from_jwt()
          or app_private.is_fansub_staff_from_jwt(((storage.foldername(name))[2])::uuid)
        )
      else false
    end
  );

notify pgrst, 'reload schema';

commit;
