-- Supabase Advisor cleanup:
-- - collapse equivalent community post INSERT policies into one policy
-- - drop redundant non-unique indexes that duplicate unique/index coverage

drop policy if exists community_posts_insert_self on public.community_posts;
drop policy if exists community_posts_insert_fansub_staff on public.community_posts;

create policy community_posts_insert_authenticated_pending
on public.community_posts
for insert
to authenticated
with check (
  public.can_manage_moderation_state()
  or (
    author_id = public.current_public_user_id()
    and status = 'pending'
    and approved_at is null
    and approved_by is null
    and rejected_at is null
    and rejected_by is null
    and reject_reason is null
    and lower(coalesce(btrim(category), ''::text)) <> 'duyuru'::text
    and (
      related_fansub_id is null
      or (
        related_fansub_id is not null
        and public.is_fansub_staff(related_fansub_id)
      )
    )
  )
);

drop index if exists public.community_post_poll_options_poll_idx;
drop index if exists public.fansub_identity_tags_fansub_idx;
drop index if exists public.premium_monthly_packages_month_key_idx;
drop index if exists public.site_announcements_active_idx;
drop index if exists public.user_manga_list_items_list_position_idx;

notify pgrst, 'reload schema';
