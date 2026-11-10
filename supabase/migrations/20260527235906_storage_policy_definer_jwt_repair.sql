-- The 232 inline policy attempt gave live diagnostic visibility but inside Storage
-- RLS the public.users invoker read returns to a fragile path.
-- The JWT-sub based definer helper approach of 231 is, after the 233 execute grant patch,
-- the more correct end state. This migration moves storage policies
-- back to the definer helper base.

begin;

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
        (storage.foldername(name))[1] = 'fansub-avatars'
        and (storage.foldername(name))[2] = app_private.current_auth_user_id_from_jwt()::text
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
