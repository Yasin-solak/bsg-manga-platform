begin;

drop function if exists public.get_fansubs_with_stats();

create or replace function public.get_fansubs_with_stats()
returns table (
  id uuid,
  name text,
  slug text,
  avatar_url text,
  description text,
  frame_type text,
  primary_color text,
  secondary_color text,
  manga_count bigint,
  follower_count bigint,
  active_frame_id uuid,
  active_background_id uuid,
  active_pattern_id uuid,
  active_profile_effect_id uuid
)
language sql
stable
set search_path = public
as $$
  select
    f.id,
    f.name,
    f.slug,
    f.avatar_url,
    f.description,
    f.frame_type,
    f.primary_color,
    f.secondary_color,
    coalesce((
      select count(distinct m.id)
      from public.mangas m
      where m.is_active = true
        and m.is_approved = true
        and (
          m.fansub_id = f.id
          or exists (
            select 1
            from public.chapters c
            where c.manga_id = m.id
              and c.fansub_id = f.id
              and c.is_active = true
              and c.is_approved = true
              and public.is_chapter_publicly_unlocked(c.publish_at)
          )
        )
    ), 0)::bigint as manga_count,
    coalesce((
      select count(*)
      from public.fansub_follows ff
      where ff.fansub_id = f.id
    ), 0)::bigint as follower_count,
    f.active_frame_id,
    f.active_background_id,
    f.active_pattern_id,
    f.active_profile_effect_id
  from public.fansubs f
  where f.is_active = true
  order by f.name asc;
$$;

grant execute on function public.get_fansubs_with_stats() to anon, authenticated;

drop policy if exists fansub_inventory_select_public on public.fansub_inventory;
create policy fansub_inventory_select_public
  on public.fansub_inventory
  for select
  using (public.is_admin() or public.is_fansub_admin(fansub_id));

drop policy if exists fansub_transactions_select_public on public.fansub_transactions;
create policy fansub_transactions_select_public
  on public.fansub_transactions
  for select
  using (public.is_admin() or public.is_fansub_admin(fansub_id));

commit;
