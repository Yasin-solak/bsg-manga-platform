-- In the Storage service folder-based identity checks use JWT sub directly.
-- When the helper function chain causes trouble in the storage policy context
-- avatar and community image write policies move to an inline subject check.

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
          (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
          or (storage.foldername(name))[2] = (
            select u.id::text
            from public.users u
            where u.auth_user_id = nullif(auth.jwt()->>'sub', '')::uuid
              and coalesce(u.is_active, true) = true
              and coalesce(u.is_banned, false) = false
              and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
              and (
                u.active_session_id is null
                or u.active_session_id = public.current_auth_session_id()
              )
            limit 1
          )
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansub-drafts'
        and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        and (storage.foldername(name))[3] = 'avatar'
      )
      or (
        (storage.foldername(name))[1] = 'fansub-avatars'
        and (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (storage.foldername(name))[3] = 'avatar'
        and exists (
          select 1
          from public.fansub_members fm
          join public.fansubs f on f.id = fm.fansub_id
          join public.users u on u.id = fm.user_id
          where fm.fansub_id = ((storage.foldername(name))[2])::uuid
            and fm.role in ('admin', 'moderator')
            and f.is_active = true
            and u.auth_user_id = nullif(auth.jwt()->>'sub', '')::uuid
            and coalesce(u.is_active, true) = true
            and coalesce(u.is_banned, false) = false
            and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
            and (
              u.active_session_id is null
              or u.active_session_id = public.current_auth_session_id()
            )
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
      coalesce(owner_id, owner::text) = (select auth.jwt()->>'sub')
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
          or (storage.foldername(name))[2] = (
            select u.id::text
            from public.users u
            where u.auth_user_id = nullif(auth.jwt()->>'sub', '')::uuid
              and coalesce(u.is_active, true) = true
              and coalesce(u.is_banned, false) = false
              and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
              and (
                u.active_session_id is null
                or u.active_session_id = public.current_auth_session_id()
              )
            limit 1
          )
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.fansub_members fm
          join public.fansubs f on f.id = fm.fansub_id
          join public.users u on u.id = fm.user_id
          where fm.fansub_id = ((storage.foldername(name))[2])::uuid
            and fm.role in ('admin', 'moderator')
            and f.is_active = true
            and u.auth_user_id = nullif(auth.jwt()->>'sub', '')::uuid
            and coalesce(u.is_active, true) = true
            and coalesce(u.is_banned, false) = false
            and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
            and (
              u.active_session_id is null
              or u.active_session_id = public.current_auth_session_id()
            )
        )
      )
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      coalesce(owner_id, owner::text) = (select auth.jwt()->>'sub')
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
          or (storage.foldername(name))[2] = (
            select u.id::text
            from public.users u
            where u.auth_user_id = nullif(auth.jwt()->>'sub', '')::uuid
              and coalesce(u.is_active, true) = true
              and coalesce(u.is_banned, false) = false
              and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
              and (
                u.active_session_id is null
                or u.active_session_id = public.current_auth_session_id()
              )
            limit 1
          )
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.fansub_members fm
          join public.fansubs f on f.id = fm.fansub_id
          join public.users u on u.id = fm.user_id
          where fm.fansub_id = ((storage.foldername(name))[2])::uuid
            and fm.role in ('admin', 'moderator')
            and f.is_active = true
            and u.auth_user_id = nullif(auth.jwt()->>'sub', '')::uuid
            and coalesce(u.is_active, true) = true
            and coalesce(u.is_banned, false) = false
            and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
            and (
              u.active_session_id is null
              or u.active_session_id = public.current_auth_session_id()
            )
        )
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
      coalesce(owner_id, owner::text) = (select auth.jwt()->>'sub')
      or (
        (storage.foldername(name))[1] = 'user-avatars'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (
          (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
          or (storage.foldername(name))[2] = (
            select u.id::text
            from public.users u
            where u.auth_user_id = nullif(auth.jwt()->>'sub', '')::uuid
              and coalesce(u.is_active, true) = true
              and coalesce(u.is_banned, false) = false
              and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
              and (
                u.active_session_id is null
                or u.active_session_id = public.current_auth_session_id()
              )
            limit 1
          )
        )
      )
      or (
        (storage.foldername(name))[1] = 'fansubs'
        and coalesce((storage.foldername(name))[2], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.fansub_members fm
          join public.fansubs f on f.id = fm.fansub_id
          join public.users u on u.id = fm.user_id
          where fm.fansub_id = ((storage.foldername(name))[2])::uuid
            and fm.role in ('admin', 'moderator')
            and f.is_active = true
            and u.auth_user_id = nullif(auth.jwt()->>'sub', '')::uuid
            and coalesce(u.is_active, true) = true
            and coalesce(u.is_banned, false) = false
            and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
            and (
              u.active_session_id is null
              or u.active_session_id = public.current_auth_session_id()
            )
        )
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
    and exists (
      select 1
      from public.community_posts cp
      join public.users u on u.id = cp.author_id
      where cp.id = ((storage.foldername(name))[3])::uuid
        and cp.status = 'pending'
        and coalesce(cp.is_active, true) = true
        and u.auth_user_id = nullif(auth.jwt()->>'sub', '')::uuid
        and coalesce(u.is_active, true) = true
        and coalesce(u.is_banned, false) = false
        and not public.is_auth_session_revoked(u.auth_user_id, public.current_auth_session_id())
        and (
          u.active_session_id is null
          or u.active_session_id = public.current_auth_session_id()
        )
    )
  );

notify pgrst, 'reload schema';

commit;
