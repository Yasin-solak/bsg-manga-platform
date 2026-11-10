-- ============================================
-- MangaZone | Homepage Feed + Performance Indexes
-- Date: 2026-02-07
-- ============================================
-- Goal:
-- 1) Return bulk data for the home page with one RPC.
-- 2) Add the missing index optimizations for home page queries.

-- ============================================
-- Index optimizasyonlari (Homepage)
-- ============================================
create index if not exists mangas_home_trending_idx
  on public.mangas (total_views desc, updated_at desc)
  where is_active = true and is_approved = true;

create index if not exists mangas_home_latest_idx
  on public.mangas (updated_at desc, total_views desc)
  where is_active = true and is_approved = true;

create index if not exists mangas_home_popular_idx
  on public.mangas (rating desc, total_views desc)
  where is_active = true and is_approved = true;

create index if not exists mangas_home_fansub_count_idx
  on public.mangas (fansub_id)
  where is_active = true and is_approved = true and fansub_id is not null;

create index if not exists community_posts_home_popular_idx
  on public.community_posts (likes_count desc, comments_count desc, created_at desc)
  where status = 'approved' and is_active = true;

create index if not exists community_posts_home_announcements_idx
  on public.community_posts (created_at desc)
  where status = 'approved' and is_active = true and category = 'Duyuru';

-- ============================================
-- Homepage feed RPC
-- ============================================
create or replace function public.get_homepage_feed(
  p_trending_limit integer default 7,
  p_latest_limit integer default 14,
  p_fansub_limit integer default 6,
  p_popular_post_limit integer default 6,
  p_announcement_limit integer default 5,
  p_sidebar_popular_manga_limit integer default 5
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with active_mangas as (
    select
      m.id,
      m.title,
      m.cover_image_url,
      m.last_chapter_number,
      m.is_new,
      m.rating,
      m.total_views,
      m.updated_at
    from public.mangas m
    where m.is_active = true
      and m.is_approved = true
  ),
  fansub_manga_counts as (
    select
      m.fansub_id,
      count(*)::bigint as manga_count
    from public.mangas m
    where m.is_active = true
      and m.is_approved = true
      and m.fansub_id is not null
    group by m.fansub_id
  ),
  fansub_follow_counts as (
    select
      ff.fansub_id,
      count(*)::bigint as follower_count
    from public.fansub_follows ff
    group by ff.fansub_id
  ),
  ranked_fansubs as (
    select
      f.id,
      f.name,
      f.slug,
      f.avatar_url,
      f.description,
      f.frame_type,
      f.primary_color,
      f.secondary_color,
      coalesce(fmc.manga_count, 0)::bigint as manga_count,
      coalesce(ffc.follower_count, 0)::bigint as follower_count,
      f.active_frame_id,
      f.active_background_id,
      f.active_pattern_id
    from public.fansubs f
    left join fansub_manga_counts fmc on fmc.fansub_id = f.id
    left join fansub_follow_counts ffc on ffc.fansub_id = f.id
    where f.is_active = true
  ),
  active_posts as (
    select
      cp.id,
      cp.category,
      cp.title,
      cp.body,
      cp.likes_count,
      cp.comments_count,
      cp.frame_type,
      cp.primary_color,
      cp.secondary_color,
      cp.is_verified,
      cp.created_at,
      u.id as author_id,
      u.username,
      u.avatar_url
    from public.community_posts cp
    join public.users u on u.id = cp.author_id
    where cp.status = 'approved'
      and cp.is_active = true
      and u.is_active = true
  )
  select jsonb_build_object(
    'trending_mangas',
    coalesce(
      (
        select jsonb_agg(to_jsonb(t))
        from (
          select *
          from active_mangas
          order by total_views desc, updated_at desc
          limit greatest(coalesce(p_trending_limit, 0), 0)
        ) as t
      ),
      '[]'::jsonb
    ),
    'latest_mangas',
    coalesce(
      (
        select jsonb_agg(to_jsonb(t))
        from (
          select *
          from active_mangas
          order by updated_at desc, total_views desc
          limit greatest(coalesce(p_latest_limit, 0), 0)
        ) as t
      ),
      '[]'::jsonb
    ),
    'popular_mangas',
    coalesce(
      (
        select jsonb_agg(to_jsonb(t))
        from (
          select *
          from active_mangas
          order by rating desc nulls last, total_views desc, updated_at desc
          limit greatest(coalesce(p_sidebar_popular_manga_limit, 0), 0)
        ) as t
      ),
      '[]'::jsonb
    ),
    'fansubs',
    coalesce(
      (
        select jsonb_agg(to_jsonb(fx))
        from (
          select *
          from ranked_fansubs
          order by follower_count desc, manga_count desc, name asc
          limit greatest(coalesce(p_fansub_limit, 0), 0)
        ) as fx
      ),
      '[]'::jsonb
    ),
    'community_posts',
    coalesce(
      (
        select jsonb_agg(to_jsonb(px))
        from (
          select *
          from active_posts
          order by likes_count desc, comments_count desc, created_at desc
          limit greatest(coalesce(p_popular_post_limit, 0), 0)
        ) as px
      ),
      '[]'::jsonb
    ),
    'announcements',
    coalesce(
      (
        select jsonb_agg(to_jsonb(ax))
        from (
          select *
          from active_posts
          where category = 'Duyuru'
          order by created_at desc
          limit greatest(coalesce(p_announcement_limit, 0), 0)
        ) as ax
      ),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.get_homepage_feed(integer, integer, integer, integer, integer, integer) to anon, authenticated;
