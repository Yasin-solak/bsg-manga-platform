-- ============================================
-- BSG Manga | Followed Activity Feed (Homepage MVP)
-- Date: 2026-02-20
-- ============================================

begin;

create index if not exists manga_comments_user_created_active_idx
  on public.manga_comments (user_id, created_at desc)
  where is_active = true;

create index if not exists chapters_fansub_public_publish_idx
  on public.chapters (fansub_id, publish_at desc, created_at desc)
  where is_active = true and is_approved = true;

create index if not exists mangas_fansub_public_created_idx
  on public.mangas (fansub_id, created_at desc)
  where is_active = true and is_approved = true and fansub_id is not null;

create index if not exists community_posts_fansub_feed_created_idx
  on public.community_posts (related_fansub_id, created_at desc)
  where is_active = true and status = 'approved';

create or replace function public.get_followed_activity_feed(
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_event_key text default null
)
returns table (
  event_key text,
  event_type text,
  actor_type text,
  actor_user_id uuid,
  actor_fansub_id uuid,
  actor_name text,
  actor_username text,
  actor_avatar_url text,
  actor_frame_type text,
  manga_id uuid,
  manga_title text,
  manga_cover_image_url text,
  chapter_id uuid,
  chapter_number numeric,
  post_id uuid,
  comment_id uuid,
  route_hint text,
  summary text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      greatest(least(coalesce(p_limit, 20), 50), 1) as safe_limit,
      p_before_created_at as before_created_at,
      nullif(trim(coalesce(p_before_event_key, '')), '') as before_event_key
  ),
  viewer as (
    select public.current_public_user_id() as user_id
  ),
  followed_users as (
    select
      u.id,
      u.username,
      u.avatar_url,
      u.frame_type
    from viewer v
    join public.user_follows uf
      on uf.follower_id = v.user_id
    join public.users u
      on u.id = uf.following_id
     and u.is_active = true
    where v.user_id is not null
  ),
  followed_fansubs as (
    select
      f.id,
      f.name,
      f.slug,
      f.avatar_url,
      f.frame_type
    from viewer v
    join public.fansub_follows ff
      on ff.user_id = v.user_id
    join public.fansubs f
      on f.id = ff.fansub_id
     and f.is_active = true
    where v.user_id is not null
  ),
  user_read_events as (
    select
      ('user-read:' || rh.user_id::text || ':' || rh.manga_id::text || ':' || to_char(rh.read_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS'))::text as event_key,
      'user_read'::text as event_type,
      'user'::text as actor_type,
      fu.id as actor_user_id,
      null::uuid as actor_fansub_id,
      fu.username::text as actor_name,
      fu.username::text as actor_username,
      fu.avatar_url::text as actor_avatar_url,
      fu.frame_type::text as actor_frame_type,
      m.id as manga_id,
      m.title::text as manga_title,
      m.cover_image_url::text as manga_cover_image_url,
      rh.chapter_id,
      rh.chapter_number,
      null::uuid as post_id,
      null::uuid as comment_id,
      case
        when rh.chapter_number is not null
          then format('/manga/%s/chapter/%s', rh.manga_id::text, rh.chapter_number::text)
        else format('/manga/%s', rh.manga_id::text)
      end::text as route_hint,
      format(
        '%s, %s mangasinda %s. bolumu okudu.',
        coalesce(fu.username, 'Bir kullanici'),
        coalesce(m.title, 'Manga'),
        coalesce(rh.chapter_number::text, '?')
      )::text as summary,
      rh.read_at as created_at
    from followed_users fu
    join public.reading_history rh
      on rh.user_id = fu.id
    join public.mangas m
      on m.id = rh.manga_id
     and m.is_active = true
     and m.is_approved = true
    where rh.read_at is not null
  ),
  user_comment_events as (
    select
      ('user-comment:' || mc.id::text)::text as event_key,
      'user_comment'::text as event_type,
      'user'::text as actor_type,
      fu.id as actor_user_id,
      null::uuid as actor_fansub_id,
      fu.username::text as actor_name,
      fu.username::text as actor_username,
      fu.avatar_url::text as actor_avatar_url,
      fu.frame_type::text as actor_frame_type,
      m.id as manga_id,
      m.title::text as manga_title,
      m.cover_image_url::text as manga_cover_image_url,
      null::uuid as chapter_id,
      null::numeric as chapter_number,
      null::uuid as post_id,
      mc.id as comment_id,
      format('/manga/%s', m.id::text)::text as route_hint,
      format(
        '%s, %s mangasina yorum yapti.',
        coalesce(fu.username, 'Bir kullanici'),
        coalesce(m.title, 'Manga')
      )::text as summary,
      mc.created_at as created_at
    from followed_users fu
    join public.manga_comments mc
      on mc.user_id = fu.id
     and mc.is_active = true
    join public.mangas m
      on m.id = mc.manga_id
     and m.is_active = true
     and m.is_approved = true
  ),
  fansub_chapter_events as (
    select
      ('fansub-chapter:' || c.id::text)::text as event_key,
      'fansub_new_chapter'::text as event_type,
      'fansub'::text as actor_type,
      null::uuid as actor_user_id,
      ff.id as actor_fansub_id,
      ff.name::text as actor_name,
      ff.slug::text as actor_username,
      ff.avatar_url::text as actor_avatar_url,
      ff.frame_type::text as actor_frame_type,
      m.id as manga_id,
      m.title::text as manga_title,
      m.cover_image_url::text as manga_cover_image_url,
      c.id as chapter_id,
      c.chapter_number,
      null::uuid as post_id,
      null::uuid as comment_id,
      format('/manga/%s/chapter/%s', m.id::text, c.chapter_number::text)::text as route_hint,
      format(
        '%s, %s mangasina %s. bolumu ekledi.',
        coalesce(ff.name, 'Bir fansub'),
        coalesce(m.title, 'Manga'),
        coalesce(c.chapter_number::text, '?')
      )::text as summary,
      coalesce(c.publish_at, c.created_at) as created_at
    from followed_fansubs ff
    join public.chapters c
      on c.fansub_id = ff.id
     and c.is_active = true
     and c.is_approved = true
     and c.publish_at <= now()
    join public.mangas m
      on m.id = c.manga_id
     and m.is_active = true
     and m.is_approved = true
  ),
  fansub_manga_events as (
    select
      ('fansub-manga:' || m.id::text)::text as event_key,
      'fansub_new_manga'::text as event_type,
      'fansub'::text as actor_type,
      null::uuid as actor_user_id,
      ff.id as actor_fansub_id,
      ff.name::text as actor_name,
      ff.slug::text as actor_username,
      ff.avatar_url::text as actor_avatar_url,
      ff.frame_type::text as actor_frame_type,
      m.id as manga_id,
      m.title::text as manga_title,
      m.cover_image_url::text as manga_cover_image_url,
      null::uuid as chapter_id,
      null::numeric as chapter_number,
      null::uuid as post_id,
      null::uuid as comment_id,
      format('/manga/%s', m.id::text)::text as route_hint,
      format(
        '%s, yeni manga ekledi: %s.',
        coalesce(ff.name, 'Bir fansub'),
        coalesce(m.title, 'Manga')
      )::text as summary,
      m.created_at as created_at
    from followed_fansubs ff
    join public.mangas m
      on m.fansub_id = ff.id
     and m.is_active = true
     and m.is_approved = true
  ),
  fansub_post_events as (
    select
      ('fansub-post:' || cp.id::text)::text as event_key,
      'fansub_post'::text as event_type,
      'fansub'::text as actor_type,
      null::uuid as actor_user_id,
      ff.id as actor_fansub_id,
      ff.name::text as actor_name,
      ff.slug::text as actor_username,
      ff.avatar_url::text as actor_avatar_url,
      ff.frame_type::text as actor_frame_type,
      m.id as manga_id,
      m.title::text as manga_title,
      m.cover_image_url::text as manga_cover_image_url,
      null::uuid as chapter_id,
      null::numeric as chapter_number,
      cp.id as post_id,
      null::uuid as comment_id,
      format('/discussion/%s', cp.id::text)::text as route_hint,
      format(
        '%s, toplulukta yeni bir paylasim yapti.',
        coalesce(ff.name, 'Bir fansub')
      )::text as summary,
      cp.created_at as created_at
    from followed_fansubs ff
    join public.community_posts cp
      on cp.related_fansub_id = ff.id
     and cp.is_active = true
     and cp.status = 'approved'
     and lower(btrim(coalesce(cp.category, ''))) <> 'duyuru'
    left join public.mangas m
      on m.id = cp.related_manga_id
     and m.is_active = true
     and m.is_approved = true
  ),
  merged_events as (
    select * from user_read_events
    union all
    select * from user_comment_events
    union all
    select * from fansub_chapter_events
    union all
    select * from fansub_manga_events
    union all
    select * from fansub_post_events
  ),
  filtered_events as (
    select e.*
    from merged_events e
    cross join params p
    where
      p.before_created_at is null
      or e.created_at < p.before_created_at
      or (
        e.created_at = p.before_created_at
        and p.before_event_key is not null
        and e.event_key < p.before_event_key
      )
  )
  select
    e.event_key,
    e.event_type,
    e.actor_type,
    e.actor_user_id,
    e.actor_fansub_id,
    e.actor_name,
    e.actor_username,
    e.actor_avatar_url,
    e.actor_frame_type,
    e.manga_id,
    e.manga_title,
    e.manga_cover_image_url,
    e.chapter_id,
    e.chapter_number,
    e.post_id,
    e.comment_id,
    e.route_hint,
    e.summary,
    e.created_at
  from filtered_events e
  order by e.created_at desc, e.event_key desc
  limit (select safe_limit from params);
$$;

revoke all on function public.get_followed_activity_feed(integer, timestamptz, text) from public;
grant execute on function public.get_followed_activity_feed(integer, timestamptz, text) to authenticated;

commit;
