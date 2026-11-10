-- Live public read surfaces must not trip on helpers with closed public direct execute grants.
-- Instead of reopening the grant, helper bodies are called from the unexposed app_private schema.

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

create or replace function app_private.chapter_public_unlock_at(p_publish_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_delay_hours integer := 24;
begin
  if p_publish_at is null then
    return null;
  end if;

  select coalesce(cfg.public_unlock_delay_hours, 24)
  into v_delay_hours
  from public.premium_runtime_config cfg
  where cfg.id = true
  limit 1;

  return p_publish_at + make_interval(hours => greatest(coalesce(v_delay_hours, 24), 0));
end;
$function$;

create or replace function app_private.is_chapter_publicly_unlocked(p_publish_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    case
      when p_publish_at is null then true
      else app_private.chapter_public_unlock_at(p_publish_at) <= now()
    end
$function$;

create or replace function app_private.is_user_eligible_for_fansub_identity_tag(p_user_id uuid, p_tag_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.fansub_identity_tags as tag
    join public.fansubs as fansub
      on fansub.id = tag.fansub_id
    where tag.id = p_tag_id
      and tag.is_active = true
      and fansub.is_active = true
      and app_private.fansub_has_boost_capability(tag.fansub_id, 'hasFansubIdentityTags')
      and (
        exists (
          select 1
          from public.fansub_members as member_row
          where member_row.fansub_id = tag.fansub_id
            and member_row.user_id = p_user_id
        )
        or exists (
          select 1
          from public.fansub_boost_grants as grant_row
          where grant_row.fansub_id = tag.fansub_id
            and grant_row.supporter_user_id = p_user_id
            and grant_row.status = 'active'
            and grant_row.starts_at <= now()
            and grant_row.expires_at > now()
        )
      )
  );
$function$;

create or replace function app_private.resolve_user_active_fansub_identity_tag(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select case
    when p_user_id is null then null
    else (
      select jsonb_build_object(
        'id', tag.id,
        'fansubId', tag.fansub_id,
        'fansubName', fansub.name,
        'fansubSlug', fansub.slug,
        'audience', 'shared',
        'shortcode', tag.shortcode,
        'badgeKey', tag.badge_key
      )
      from public.user_selected_fansub_identity_tags as selected_tag
      join public.fansub_identity_tags as tag
        on tag.id = selected_tag.fansub_identity_tag_id
      join public.fansubs as fansub
        on fansub.id = tag.fansub_id
      where selected_tag.user_id = p_user_id
        and app_private.is_user_eligible_for_fansub_identity_tag(p_user_id, tag.id)
      limit 1
    )
  end;
$function$;

revoke execute on function app_private.chapter_public_unlock_at(timestamptz) from public;
revoke execute on function app_private.is_chapter_publicly_unlocked(timestamptz) from public;
revoke execute on function app_private.is_user_eligible_for_fansub_identity_tag(uuid, uuid) from public;
revoke execute on function app_private.resolve_user_active_fansub_identity_tag(uuid) from public;

grant execute on function app_private.chapter_public_unlock_at(timestamptz) to anon, authenticated, service_role;
grant execute on function app_private.is_chapter_publicly_unlocked(timestamptz) to anon, authenticated, service_role;
grant execute on function app_private.is_user_eligible_for_fansub_identity_tag(uuid, uuid) to anon, authenticated, service_role;
grant execute on function app_private.resolve_user_active_fansub_identity_tag(uuid) to anon, authenticated, service_role;

create or replace view public.public_user_directory
with (security_invoker = true)
as
select
  u.id,
  u.username,
  u.avatar_url,
  u.frame_type,
  u.background_type,
  app_private.resolve_user_active_fansub_identity_tag(u.id) as active_fansub_identity_tag
from public.users u
cross join lateral app_private.get_profile_view_access(u.id) as access(
  is_owner,
  viewer_is_follower,
  profile_visible,
  stats_visible,
  social_links_visible,
  activity_visible,
  profile_visibility,
  stats_visibility,
  social_links_visibility,
  activity_visibility
)
where coalesce(u.is_active, true) = true
  and coalesce(u.is_banned, false) = false
  and (
    app_private.can_manage_moderation_state()
    or coalesce(access.profile_visible, false) = true
  );

grant select on public.public_user_directory to anon, authenticated;

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
  has_full_name_style boolean,
  can_upload_static_background boolean,
  can_upload_video_background boolean,
  active_frame_id uuid,
  active_background_id uuid,
  active_pattern_id uuid,
  active_profile_effect_id uuid
)
language sql
stable
security invoker
set search_path = public
as $function$
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
              and app_private.is_chapter_publicly_unlocked(c.publish_at)
          )
        )
    ), 0)::bigint as manga_count,
    coalesce((
      select count(*)
      from public.fansub_follows ff
      where ff.fansub_id = f.id
    ), 0)::bigint as follower_count,
    app_private.fansub_has_boost_capability(f.id, 'hasDiscoverBadge') as has_discover_badge,
    app_private.fansub_has_boost_capability(f.id, 'hasGoldFrame') as has_gold_frame,
    app_private.fansub_has_boost_capability(f.id, 'hasFullNameStyle') as has_full_name_style,
    app_private.fansub_has_boost_capability(f.id, 'canUploadStaticBackground') as can_upload_static_background,
    app_private.fansub_has_boost_capability(f.id, 'canUploadVideoBackground') as can_upload_video_background,
    f.active_frame_id,
    f.active_background_id,
    f.active_pattern_id,
    f.active_profile_effect_id
  from public.fansubs f
  where f.is_active = true
  order by f.name asc;
$function$;

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
security invoker
set search_path = public
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
$function$;

grant execute on function public.get_homepage_feed(integer, integer, integer, integer, integer, integer) to anon, authenticated;

create or replace function public.enforce_community_post_moderation_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if public.can_manage_moderation_state() then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and current_setting('app.community_post_view_counter_update', true) = 'true'
    and old.status = new.status
    and old.author_id is not distinct from new.author_id
    and old.related_fansub_id is not distinct from new.related_fansub_id
    and coalesce(new.views_count, 0) = coalesce(old.views_count, 0) + 1
    and (to_jsonb(new) - 'views_count' - 'updated_at') = (to_jsonb(old) - 'views_count' - 'updated_at')
  then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.author_id is distinct from new.author_id then
      raise exception 'Topluluk gonderisi sahibi degistirilemez.';
    end if;

    if old.related_fansub_id is distinct from new.related_fansub_id then
      raise exception 'Topluluk gonderisi fansub baglami degistirilemez.';
    end if;

    if old.status <> 'pending' then
      raise exception 'Incelemesi tamamlanan topluluk gonderisini yalniz admin guncelleyebilir.';
    end if;
  end if;

  if coalesce(new.status, 'pending') <> 'pending' then
    raise exception 'Topluluk gonderisi onay durumunu yalniz admin degistirebilir.';
  end if;

  if new.approved_at is not null
    or new.approved_by is not null
    or new.rejected_at is not null
    or new.rejected_by is not null
    or new.reject_reason is not null then
    raise exception 'Topluluk gonderisi moderasyon alanlarini yalniz admin degistirebilir.';
  end if;

  return new;
end;
$function$;

create or replace function app_private.track_community_post_view(p_post_id uuid, p_viewer_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_inserted boolean := false;
begin
  if p_post_id is null or nullif(btrim(coalesce(p_viewer_key, '')), '') is null then
    return jsonb_build_object('counted', false);
  end if;

  insert into public.community_post_view_events (post_id, viewer_key)
  values (p_post_id, btrim(p_viewer_key))
  on conflict do nothing;

  v_inserted := found;

  if v_inserted then
    perform set_config('app.community_post_view_counter_update', 'true', true);

    update public.community_posts
    set
      views_count = coalesce(views_count, 0) + 1,
      updated_at = now()
    where id = p_post_id
      and status = 'approved'
      and is_active = true;

    perform set_config('app.community_post_view_counter_update', '', true);
  end if;

  return jsonb_build_object('counted', v_inserted);
end;
$function$;

revoke execute on function app_private.track_community_post_view(uuid, text) from public;
grant execute on function app_private.track_community_post_view(uuid, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
