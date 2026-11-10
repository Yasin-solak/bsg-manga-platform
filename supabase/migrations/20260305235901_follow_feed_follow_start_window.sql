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
      nullif(trim(coalesce(p_before_event_key, '')), '') as before_event_key,
      now() - interval '90 days' as window_start,
      now() - interval '24 hours' as backfill_cutoff
  ),
  viewer as (
    select public.current_public_user_id() as user_id
  ),
  followed_users as (
    select
      uf.following_id as user_id,
      uf.created_at as followed_at
    from viewer v
    join public.user_follows uf
      on uf.follower_id = v.user_id
    where v.user_id is not null
  ),
  followed_fansubs as (
    select
      ff.fansub_id,
      ff.created_at as followed_at
    from viewer v
    join public.fansub_follows ff
      on ff.user_id = v.user_id
    where v.user_id is not null
  ),
  candidate_events as (
    select
      ae.*,
      greatest(
        p.window_start,
        case
          when fu.followed_at >= p.backfill_cutoff then fu.followed_at - interval '24 hours'
          else fu.followed_at
        end
      ) as follow_window_start
    from followed_users fu
    cross join params p
    join public.activity_events ae
      on ae.actor_type = 'user'
     and ae.actor_user_id = fu.user_id
     and ae.is_active = true
    union all
    select
      ae.*,
      greatest(
        p.window_start,
        case
          when ff.followed_at >= p.backfill_cutoff then ff.followed_at - interval '24 hours'
          else ff.followed_at
        end
      ) as follow_window_start
    from followed_fansubs ff
    cross join params p
    join public.activity_events ae
      on ae.actor_type = 'fansub'
     and ae.actor_fansub_id = ff.fansub_id
     and ae.is_active = true
  ),
  visible_events as (
    select ce.*
    from candidate_events ce
    left join public.users actor_user
      on ce.actor_type = 'user'
     and actor_user.id = ce.actor_user_id
    left join public.fansubs actor_fansub
      on ce.actor_type = 'fansub'
     and actor_fansub.id = ce.actor_fansub_id
    left join public.mangas m
      on ce.manga_id = m.id
    left join public.chapters c
      on ce.chapter_id = c.id
    where
      ce.created_at >= ce.follow_window_start
      and (
        (ce.actor_type = 'user' and coalesce(actor_user.is_active, false) = true)
        or (ce.actor_type = 'fansub' and coalesce(actor_fansub.is_active, false) = true)
      )
      and (
        ce.manga_id is null
        or (coalesce(m.is_active, false) = true and coalesce(m.is_approved, false) = true)
      )
      and (
        ce.chapter_id is null
        or (
          coalesce(c.is_active, false) = true
          and coalesce(c.is_approved, false) = true
          and (c.publish_at is null or c.publish_at <= now())
        )
      )
  ),
  filtered_events as (
    select ve.*
    from visible_events ve
    cross join params p
    where
      p.before_created_at is null
      or ve.created_at < p.before_created_at
      or (
        ve.created_at = p.before_created_at
        and p.before_event_key is not null
        and ve.event_key < p.before_event_key
      )
  )
  select
    fe.event_key,
    fe.event_type,
    fe.actor_type,
    fe.actor_user_id,
    fe.actor_fansub_id,
    fe.actor_name,
    fe.actor_username,
    fe.actor_avatar_url,
    fe.actor_frame_type,
    fe.manga_id,
    fe.manga_title,
    fe.manga_cover_image_url,
    fe.chapter_id,
    fe.chapter_number,
    fe.post_id,
    fe.comment_id,
    fe.route_hint,
    fe.summary,
    fe.created_at
  from filtered_events fe
  order by fe.created_at desc, fe.event_key desc
  limit (select safe_limit from params);
$$;

revoke all on function public.get_followed_activity_feed(integer, timestamptz, text) from public;
grant execute on function public.get_followed_activity_feed(integer, timestamptz, text) to authenticated;
