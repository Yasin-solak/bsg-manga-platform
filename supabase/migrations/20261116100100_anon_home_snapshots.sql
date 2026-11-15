-- The anonymous homepage is the first page a traffic spike hits, and its two
-- RPCs aggregate the whole catalog on every call. Anonymous visitors now read a
-- snapshot that pg_cron refreshes every five minutes.
--
-- Safety properties:
-- * The snapshot is computed under the anon role, so row level security decides
--   what it contains exactly as it does for a live anonymous call (for example,
--   mature series stay hidden).
-- * Nothing reachable from the API can write to it: only the cron job (running
--   as postgres) refreshes it, and the API roles can only read it.
-- * Signed-in users and unusual parameters still get the live result, and a
--   snapshot older than 15 minutes is ignored, so a stopped cron job falls back
--   to the previous behaviour.
--
-- The live functions also clamp their list sizes to 50 rows; callers ask for at
-- most 14.

create table if not exists app_private.anon_rpc_snapshots (
  snapshot_key text primary key,
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);

alter table app_private.anon_rpc_snapshots enable row level security;
revoke all on table app_private.anon_rpc_snapshots from public, anon, authenticated;

create or replace function app_private.read_anon_rpc_snapshot(p_snapshot_key text, p_max_age_seconds integer)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select s.payload
  from app_private.anon_rpc_snapshots s
  where s.snapshot_key = p_snapshot_key
    and s.refreshed_at > now() - make_interval(secs => greatest(coalesce(p_max_age_seconds, 0), 0));
$function$;

revoke execute on function app_private.read_anon_rpc_snapshot(text, integer) from public;
grant execute on function app_private.read_anon_rpc_snapshot(text, integer) to anon, authenticated, service_role;

create or replace function app_private.jsonb_array_head(p_items jsonb, p_count integer)
returns jsonb
language sql
immutable
set search_path to ''
as $function$
  select coalesce(jsonb_agg(t.item order by t.position), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
    with ordinality as t(item, position)
  where t.position <= greatest(coalesce(p_count, 0), 0);
$function$;

revoke execute on function app_private.jsonb_array_head(jsonb, integer) from public;
grant execute on function app_private.jsonb_array_head(jsonb, integer) to anon, authenticated, service_role;

-- Live body of get_homepage_feed, unchanged except for the 50-row clamp.
create or replace function app_private.homepage_feed_live(
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
set search_path to 'public'
as $function$
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
      app_private.fansub_has_boost_capability(f.id, 'hasFullNameStyle') as has_full_name_style,
      app_private.fansub_has_boost_capability(f.id, 'canUploadStaticBackground') as can_upload_static_background,
      app_private.fansub_has_boost_capability(f.id, 'canUploadVideoBackground') as can_upload_video_background,
      coalesce(fmc.manga_count, 0)::bigint as manga_count,
      coalesce(ffc.follower_count, 0)::bigint as follower_count,
      f.active_frame_id,
      f.active_background_id,
      f.active_pattern_id
    from public.fansubs f
    left join fansub_manga_counts fmc on fmc.fansub_id = f.id
    left join fansub_follow_counts ffc on ffc.fansub_id = f.id
    where f.is_active = true
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
          limit least(greatest(coalesce(p_trending_limit, 0), 0), 50)
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
          limit least(greatest(coalesce(p_latest_limit, 0), 0), 50)
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
          limit least(greatest(coalesce(p_sidebar_popular_manga_limit, 0), 0), 50)
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
          limit least(greatest(coalesce(p_fansub_limit, 0), 0), 50)
        ) as fx
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
            u.avatar_url,
            null::uuid as related_fansub_id,
            null::text as fansub_name,
            null::text as fansub_slug,
            null::text as fansub_avatar_url
          from public.site_announcements sa
          left join public.users u on u.id = sa.created_by and u.is_active = true
          where sa.is_active = true
          order by sa.published_at desc, sa.created_at desc
          limit least(greatest(coalesce(p_announcement_limit, 0), 0), 50)
        ) as ax
      ),
      '[]'::jsonb
    )
  );
$function$;

revoke execute on function app_private.homepage_feed_live(integer, integer, integer, integer, integer, integer) from public;
grant execute on function app_private.homepage_feed_live(integer, integer, integer, integer, integer, integer) to anon, authenticated, service_role;

-- Live body of get_home_discussion_highlights, unchanged.
create or replace function app_private.home_discussion_highlights_live(
  p_manga_limit integer default 6,
  p_chapter_limit integer default 6,
  p_window_days integer default 14
)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with params as (
    select
      greatest(least(coalesce(p_manga_limit, 6), 20), 1) as manga_limit,
      greatest(least(coalesce(p_chapter_limit, 6), 20), 1) as chapter_limit,
      greatest(least(coalesce(p_window_days, 14), 90), 1) as window_days,
      now() - make_interval(days => greatest(least(coalesce(p_window_days, 14), 90), 1)) as window_start
  ),
  base_comments as (
    select
      mc.id,
      mc.manga_id,
      mc.chapter_id,
      mc.created_at
    from public.manga_comments mc
    join public.mangas m
      on m.id = mc.manga_id
     and m.is_active = true
     and m.is_approved = true
    where mc.is_active = true
  ),
  manga_rank as (
    select
      m.id as manga_id,
      m.title as manga_title,
      m.cover_image_url,
      count(*)::int as comment_count,
      count(*) filter (where bc.created_at >= p.window_start)::int as recent_comment_count,
      max(bc.created_at) as last_comment_at
    from params p
    join base_comments bc on true
    join public.mangas m on m.id = bc.manga_id
    group by m.id, m.title, m.cover_image_url, p.window_start
  ),
  top_mangas as (
    select
      mr.manga_id,
      mr.manga_title,
      mr.cover_image_url,
      mr.comment_count,
      mr.recent_comment_count,
      mr.last_comment_at
    from manga_rank mr
    order by mr.recent_comment_count desc, mr.comment_count desc, mr.last_comment_at desc
    limit (select manga_limit from params)
  ),
  chapter_rank as (
    select
      c.id as chapter_id,
      c.manga_id,
      c.chapter_number,
      c.title as chapter_title,
      m.title as manga_title,
      m.cover_image_url,
      count(*)::int as comment_count,
      count(*) filter (where bc.created_at >= p.window_start)::int as recent_comment_count,
      max(bc.created_at) as last_comment_at
    from params p
    join base_comments bc
      on bc.chapter_id is not null
    join public.chapters c
      on c.id = bc.chapter_id
     and c.is_active = true
     and c.is_approved = true
     and (c.publish_at is null or c.publish_at <= now())
    join public.mangas m
      on m.id = c.manga_id
     and m.is_active = true
     and m.is_approved = true
    group by c.id, c.manga_id, c.chapter_number, c.title, m.title, m.cover_image_url, p.window_start
  ),
  top_chapters as (
    select
      cr.chapter_id,
      cr.manga_id,
      cr.chapter_number,
      cr.chapter_title,
      cr.manga_title,
      cr.cover_image_url,
      cr.comment_count,
      cr.recent_comment_count,
      cr.last_comment_at
    from chapter_rank cr
    order by cr.recent_comment_count desc, cr.comment_count desc, cr.last_comment_at desc
    limit (select chapter_limit from params)
  )
  select jsonb_build_object(
    'window_days', (select window_days from params),
    'top_mangas',
    coalesce(
      (
        select jsonb_agg(to_jsonb(tm) order by tm.recent_comment_count desc, tm.comment_count desc, tm.last_comment_at desc)
        from top_mangas tm
      ),
      '[]'::jsonb
    ),
    'top_chapters',
    coalesce(
      (
        select jsonb_agg(to_jsonb(tc) order by tc.recent_comment_count desc, tc.comment_count desc, tc.last_comment_at desc)
        from top_chapters tc
      ),
      '[]'::jsonb
    )
  );
$function$;

revoke execute on function app_private.home_discussion_highlights_live(integer, integer, integer) from public;
grant execute on function app_private.home_discussion_highlights_live(integer, integer, integer) to anon, authenticated, service_role;

create or replace function public.get_homepage_feed(
  p_trending_limit integer default 7,
  p_latest_limit integer default 14,
  p_fansub_limit integer default 6,
  p_popular_post_limit integer default 6,
  p_announcement_limit integer default 5,
  p_sidebar_popular_manga_limit integer default 5
)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_snapshot jsonb;
begin
  -- The snapshot holds the top 20 of every list, computed as anon.
  if current_user = 'anon'
    and greatest(
      coalesce(p_trending_limit, 0),
      coalesce(p_latest_limit, 0),
      coalesce(p_fansub_limit, 0),
      coalesce(p_announcement_limit, 0),
      coalesce(p_sidebar_popular_manga_limit, 0)
    ) <= 20
  then
    v_snapshot := app_private.read_anon_rpc_snapshot('home_feed:v1', 900);
    if v_snapshot is not null then
      return jsonb_build_object(
        'trending_mangas', app_private.jsonb_array_head(v_snapshot -> 'trending_mangas', p_trending_limit),
        'latest_mangas', app_private.jsonb_array_head(v_snapshot -> 'latest_mangas', p_latest_limit),
        'popular_mangas', app_private.jsonb_array_head(v_snapshot -> 'popular_mangas', p_sidebar_popular_manga_limit),
        'fansubs', app_private.jsonb_array_head(v_snapshot -> 'fansubs', p_fansub_limit),
        'announcements', app_private.jsonb_array_head(v_snapshot -> 'announcements', p_announcement_limit)
      );
    end if;
  end if;

  return app_private.homepage_feed_live(
    p_trending_limit,
    p_latest_limit,
    p_fansub_limit,
    p_popular_post_limit,
    p_announcement_limit,
    p_sidebar_popular_manga_limit
  );
end;
$function$;

create or replace function public.get_home_discussion_highlights(
  p_manga_limit integer default 6,
  p_chapter_limit integer default 6,
  p_window_days integer default 14
)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_snapshot jsonb;
  v_window_days integer := greatest(least(coalesce(p_window_days, 14), 90), 1);
begin
  -- The snapshot holds the top 20 mangas and chapters for the default 14-day window.
  if current_user = 'anon' and v_window_days = 14 then
    v_snapshot := app_private.read_anon_rpc_snapshot('home_discussion_highlights:14:v1', 900);
    if v_snapshot is not null then
      return jsonb_build_object(
        'window_days', v_window_days,
        'top_mangas', app_private.jsonb_array_head(
          v_snapshot -> 'top_mangas',
          greatest(least(coalesce(p_manga_limit, 6), 20), 1)
        ),
        'top_chapters', app_private.jsonb_array_head(
          v_snapshot -> 'top_chapters',
          greatest(least(coalesce(p_chapter_limit, 6), 20), 1)
        )
      );
    end if;
  end if;

  return app_private.home_discussion_highlights_live(p_manga_limit, p_chapter_limit, p_window_days);
end;
$function$;

create or replace function app_private.refresh_anon_home_snapshots()
returns void
language plpgsql
set search_path to ''
as $function$
declare
  v_feed jsonb;
  v_highlights jsonb;
begin
  -- Compute exactly what an anonymous visitor may see: run the live queries as
  -- the anon role, with the same JWT role claim PostgREST sets for an anonymous
  -- request, so its row level security policies shape the snapshot.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;
  v_feed := app_private.homepage_feed_live(20, 20, 20, 0, 20, 20);
  v_highlights := app_private.home_discussion_highlights_live(20, 20, 14);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.role', '', true);

  insert into app_private.anon_rpc_snapshots (snapshot_key, payload, refreshed_at)
  values
    ('home_feed:v1', v_feed, now()),
    ('home_discussion_highlights:14:v1', v_highlights, now())
  on conflict (snapshot_key) do update
    set payload = excluded.payload,
        refreshed_at = excluded.refreshed_at;
end;
$function$;

revoke execute on function app_private.refresh_anon_home_snapshots() from public, anon, authenticated;

-- Hiding a series, a fansub or an announcement must not wait for the next
-- refresh: drop the snapshots so anonymous callers get the live result until
-- cron rebuilds them. UPDATE OF fires only when a listed column is in the SET
-- list, so view counter updates do not trigger it.
create or replace function app_private.invalidate_anon_home_snapshots()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  delete from app_private.anon_rpc_snapshots;
  return null;
end;
$function$;

revoke execute on function app_private.invalidate_anon_home_snapshots() from public, anon, authenticated;

drop trigger if exists trg_mangas_visibility_invalidates_anon_home on public.mangas;
create trigger trg_mangas_visibility_invalidates_anon_home
  after update of is_active, is_approved, is_mature or delete on public.mangas
  for each statement execute function app_private.invalidate_anon_home_snapshots();

drop trigger if exists trg_fansubs_visibility_invalidates_anon_home on public.fansubs;
create trigger trg_fansubs_visibility_invalidates_anon_home
  after update of is_active or delete on public.fansubs
  for each statement execute function app_private.invalidate_anon_home_snapshots();

drop trigger if exists trg_site_announcements_invalidates_anon_home on public.site_announcements;
create trigger trg_site_announcements_invalidates_anon_home
  after insert or update or delete on public.site_announcements
  for each statement execute function app_private.invalidate_anon_home_snapshots();

select cron.schedule('anon-home-snapshots', '*/5 * * * *', 'select app_private.refresh_anon_home_snapshots();');

select app_private.refresh_anon_home_snapshots();
