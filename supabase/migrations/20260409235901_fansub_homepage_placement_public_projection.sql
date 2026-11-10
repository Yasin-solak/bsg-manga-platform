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
  custom_background_asset_url text,
  manga_count bigint,
  follower_count bigint,
  has_discover_badge boolean,
  has_gold_frame boolean,
  has_homepage_placement boolean,
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
    f.custom_background_asset_url,
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
    boost.has_discover_badge,
    boost.has_gold_frame,
    boost.has_homepage_placement,
    f.active_frame_id,
    f.active_background_id,
    f.active_pattern_id,
    f.active_profile_effect_id
  from public.fansubs f
  left join lateral (
    select
      public.fansub_has_boost_capability(f.id, 'hasDiscoverBadge') as has_discover_badge,
      public.fansub_has_boost_capability(f.id, 'hasGoldFrame') as has_gold_frame,
      public.fansub_has_boost_capability(f.id, 'hasHomepagePlacement') as has_homepage_placement
  ) boost on true
  where f.is_active = true
  order by f.name asc;
$$;

grant execute on function public.get_fansubs_with_stats() to anon, authenticated;

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
      f.custom_background_asset_url,
      coalesce(fmc.manga_count, 0)::bigint as manga_count,
      coalesce(ffc.follower_count, 0)::bigint as follower_count,
      boost.has_homepage_placement,
      f.active_frame_id,
      f.active_background_id,
      f.active_pattern_id
    from public.fansubs f
    left join fansub_manga_counts fmc on fmc.fansub_id = f.id
    left join fansub_follow_counts ffc on ffc.fansub_id = f.id
    left join lateral (
      select public.fansub_has_boost_capability(f.id, 'hasHomepagePlacement') as has_homepage_placement
    ) boost on true
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
      cp.author_id,
      u.username,
      u.avatar_url,
      cp.related_fansub_id,
      rf.name as fansub_name,
      rf.slug as fansub_slug,
      rf.avatar_url as fansub_avatar_url,
      (coalesce(cp.likes_count, 0) + coalesce(cp.comments_count, 0) * 2)::bigint as engagement_score
    from public.community_posts cp
    join public.users u on u.id = cp.author_id
    left join public.fansubs rf on rf.id = cp.related_fansub_id and rf.is_active = true
    where cp.status = 'approved'
      and cp.is_active = true
      and u.is_active = true
      and lower(btrim(coalesce(cp.category, ''))) <> 'duyuru'
  ),
  community_today as (
    select *
    from active_posts
    where created_at >= now() - interval '1 day'
    order by engagement_score desc, created_at desc, id desc
    limit 3
  ),
  community_weekly as (
    select *
    from active_posts
    where created_at >= now() - interval '7 day'
    order by engagement_score desc, created_at desc, id desc
    limit 3
  ),
  community_monthly as (
    select *
    from active_posts
    where created_at >= now() - interval '30 day'
    order by engagement_score desc, created_at desc, id desc
    limit 3
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
          order by has_homepage_placement desc, follower_count desc, manga_count desc, name asc
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
          order by engagement_score desc, created_at desc, id desc
          limit greatest(coalesce(p_popular_post_limit, 0), 0)
        ) as px
      ),
      '[]'::jsonb
    ),
    'community_highlights',
    jsonb_build_object(
      'today',
      coalesce((select jsonb_agg(to_jsonb(t)) from community_today t), '[]'::jsonb),
      'weekly',
      coalesce((select jsonb_agg(to_jsonb(t)) from community_weekly t), '[]'::jsonb),
      'monthly',
      coalesce((select jsonb_agg(to_jsonb(t)) from community_monthly t), '[]'::jsonb)
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
            u.avatar_url,
            null::uuid as related_fansub_id,
            null::text as fansub_name,
            null::text as fansub_slug,
            null::text as fansub_avatar_url
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

commit;
