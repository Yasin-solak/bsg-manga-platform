-- Narrow storage RLS permission for the community images localhost/Supabase fallback upload flow.
-- Independent of the Cloudflare/R2 prod path; opens only store-assets/community/posts/{postId}/slot-0x.
drop policy if exists "Community post image upload own posts" on storage.objects;

create policy "Community post image upload own posts"
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
    then exists (
      select 1
      from public.community_posts cp
      where cp.id = ((storage.foldername(name))[3])::uuid
        and (
          cp.author_id = public.current_public_user_id()
          or public.is_admin()
        )
    )
    else false
  end
);
