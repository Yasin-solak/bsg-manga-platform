-- The community image fallback upload policy must not depend on the public helper rewrite.
-- Pending post ownership is validated with an app_private definer helper.

begin;

grant usage on schema app_private to authenticated, service_role;
grant execute on function app_private.can_write_pending_community_post_child(uuid) to authenticated, service_role;

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
      then app_private.can_write_pending_community_post_child(((storage.foldername(name))[3])::uuid)
      else false
    end
  );

notify pgrst, 'reload schema';

commit;
