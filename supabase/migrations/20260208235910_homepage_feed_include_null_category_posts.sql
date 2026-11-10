-- get_homepage_feed also includes community posts with category = null.
-- Old condition: cp.category <> 'Duyuru' excluded null values.

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
      and lower(btrim(coalesce(cp.category, ''))) <> 'duyuru'
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
          select
            sa.id,
            'Duyuru'::text as category,
            sa.title,
            sa.body,
            0::bigint as likes_count,
            0::bigint as comments_count,
            null::text as frame_type,
            sa.primary_color,
            sa.secondary_color,
            true as is_verified,
            coalesce(sa.published_at, sa.created_at) as created_at,
            coalesce(sa.created_by, '00000000-0000-0000-0000-000000000001'::uuid) as author_id,
            coalesce(u.username, 'Duyuru Merkezi') as username,
            u.avatar_url
          from public.site_announcements sa
          left join public.users u on u.id = sa.created_by and u.is_active = true
          where sa.is_active = true
          order by sa.published_at desc, sa.created_at desc
          limit greatest(coalesce(p_announcement_limit, 0), 0)
        ) as ax
      ),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.get_homepage_feed(integer, integer, integer, integer, integer, integer) to anon, authenticated;

