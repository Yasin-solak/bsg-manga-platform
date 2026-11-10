-- Data RPCs for the Fansub Studio "Community" tracking desk.
--
-- Product decision: the Community desk is for tracking community posts where the fansub is TAGGED (related_fansub_ids) or
-- shared in the fansub name (related_fansub_id).
-- A fansub has NO user block / post reject permission; the desk is track-only +
-- shows approval/report signals. Post approval is done by the site admin.
--
-- 1) list_fansub_tagged_community_feed: a paged, rich list of fansub-related posts
-- (author role, related manga, counters, state). Tab filter with p_status.
-- 2) get_fansub_manage_community_overview: right column summary data (signals, 7d
-- community health, most active mangas, latest active posts).

begin;

-- Speed up array membership lookup for tagged posts.
create index if not exists community_posts_related_fansub_ids_gin_idx
  on public.community_posts using gin (related_fansub_ids);

create or replace function public.list_fansub_tagged_community_feed(
  p_fansub_id uuid,
  p_page integer default 1,
  p_limit integer default 20,
  p_search text default null,
  p_status text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_status text := lower(trim(coalesce(p_status, 'all')));
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id) or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansubun topluluk akisini gorme yetkiniz yok.';
  end if;

  if v_status not in ('all', 'pending', 'approved', 'rejected', 'reported') then
    v_status := 'all';
  end if;

  v_offset := (v_page - 1) * v_limit;

  -- Shared filter: fansub tagged OR post in the fansub name; active; not an announcement.
  with base as (
    select cp.*
    from public.community_posts cp
    where cp.is_active = true
      and lower(btrim(coalesce(cp.category, ''))) <> 'duyuru'
      and (cp.related_fansub_id = p_fansub_id or p_fansub_id = any(cp.related_fansub_ids))
  ),
  filtered as (
    select b.*
    from base b
    where (
        v_status = 'all'
        or (v_status in ('pending', 'approved', 'rejected') and b.status = v_status)
        or (v_status = 'reported' and exists (
          select 1 from public.reports r
          where r.target_type = 'post' and r.target_id = b.id and r.status = 'pending'
        ))
      )
      and (
        v_search is null
        or coalesce(b.title, '') ilike ('%' || v_search || '%')
        or coalesce(b.body, '') ilike ('%' || v_search || '%')
        or coalesce(b.category, '') ilike ('%' || v_search || '%')
      )
  )
  select count(*) into v_total from filtered;

  with base as (
    select cp.*
    from public.community_posts cp
    where cp.is_active = true
      and lower(btrim(coalesce(cp.category, ''))) <> 'duyuru'
      and (cp.related_fansub_id = p_fansub_id or p_fansub_id = any(cp.related_fansub_ids))
  ),
  filtered as (
    select b.*
    from base b
    where (
        v_status = 'all'
        or (v_status in ('pending', 'approved', 'rejected') and b.status = v_status)
        or (v_status = 'reported' and exists (
          select 1 from public.reports r
          where r.target_type = 'post' and r.target_id = b.id and r.status = 'pending'
        ))
      )
      and (
        v_search is null
        or coalesce(b.title, '') ilike ('%' || v_search || '%')
        or coalesce(b.body, '') ilike ('%' || v_search || '%')
        or coalesce(b.category, '') ilike ('%' || v_search || '%')
      )
    order by b.updated_at desc, b.created_at desc
    offset v_offset
    limit v_limit
  ),
  enriched as (
    select
      f.id,
      f.author_id,
      u.username as author_username,
      u.avatar_url as author_avatar_url,
      fm.role as author_fansub_role,
      f.category,
      f.title,
      f.body,
      f.tags,
      f.status,
      f.related_manga_id,
      m.title as manga_title,
      m.slug as manga_slug,
      f.chapter_number,
      coalesce(f.comments_count, 0) as comments_count,
      coalesce(f.reactions_count, 0) as reactions_count,
      coalesce(f.likes_count, 0) as likes_count,
      (f.related_fansub_id = p_fansub_id) as is_fansub_authored,
      (
        select count(*) from public.reports r
        where r.target_type = 'post' and r.target_id = f.id and r.status = 'pending'
      ) as open_report_count,
      f.created_at,
      f.updated_at
    from filtered f
    join public.users u on u.id = f.author_id
    left join public.fansub_members fm on fm.user_id = f.author_id and fm.fansub_id = p_fansub_id
    left join public.mangas m on m.id = f.related_manga_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'authorId', e.author_id,
        'authorUsername', e.author_username,
        'authorAvatarUrl', e.author_avatar_url,
        'authorFansubRole', e.author_fansub_role,
        'category', e.category,
        'title', e.title,
        'body', e.body,
        'tags', coalesce(e.tags, '{}'::text[]),
        'status', e.status,
        'relatedMangaId', e.related_manga_id,
        'mangaTitle', e.manga_title,
        'mangaSlug', e.manga_slug,
        'chapterNumber', e.chapter_number,
        'commentsCount', e.comments_count,
        'reactionsCount', e.reactions_count,
        'likesCount', e.likes_count,
        'isFansubAuthored', e.is_fansub_authored,
        'openReportCount', e.open_report_count,
        'createdAt', e.created_at,
        'updatedAt', e.updated_at
      )
      order by e.updated_at desc, e.created_at desc
    ),
    '[]'::jsonb
  )
  into v_items
  from enriched e;

  return jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page, 'limit', v_limit);
end;
$$;

create or replace function public.get_fansub_manage_community_overview(
  p_fansub_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_payload jsonb;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub bilgisi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id) or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansubun topluluk ozetini gorme yetkiniz yok.';
  end if;

  with tagged as (
    select cp.*
    from public.community_posts cp
    where cp.is_active = true
      and lower(btrim(coalesce(cp.category, ''))) <> 'duyuru'
      and (cp.related_fansub_id = p_fansub_id or p_fansub_id = any(cp.related_fansub_ids))
  ),
  signals as (
    select
      count(*)::bigint as tagged_total,
      count(*) filter (where t.status = 'pending')::bigint as pending_count,
      count(*) filter (where t.created_at >= now() - interval '7 days')::bigint as posts_7d
    from tagged t
  ),
  reported as (
    select count(distinct r.target_id)::bigint as reported_count
    from public.reports r
    where r.status = 'pending'
      and r.target_type = 'post'
      and exists (select 1 from tagged t where t.id = r.target_id)
  ),
  comment_stats as (
    select
      count(*)::bigint as comments_7d,
      count(distinct cc.author_id)::bigint as commenters_7d
    from public.community_comments cc
    where cc.is_active = true
      and cc.created_at >= now() - interval '7 days'
      and exists (select 1 from tagged t where t.id = cc.post_id)
  ),
  reaction_stats as (
    select
      (
        select count(*)::bigint from public.community_post_reactions cpr
        where cpr.created_at >= now() - interval '7 days'
          and exists (select 1 from tagged t where t.id = cpr.post_id)
      )
      +
      (
        select count(*)::bigint from public.community_post_likes cpl
        where cpl.created_at >= now() - interval '7 days'
          and exists (select 1 from tagged t where t.id = cpl.post_id)
      ) as reactions_7d
  ),
  participation as (
    select count(distinct uid)::bigint as participants_7d
    from (
      select t.author_id as uid from tagged t where t.created_at >= now() - interval '7 days'
      union
      select cc.author_id as uid
      from public.community_comments cc
      where cc.is_active = true
        and cc.created_at >= now() - interval '7 days'
        and exists (select 1 from tagged t where t.id = cc.post_id)
    ) p
  ),
  member_count as (
    select count(*)::bigint as members from public.fansub_members fm where fm.fansub_id = p_fansub_id
  ),
  top_manga_rows as (
    select
      m.id, m.title, m.slug,
      coalesce(m.total_views, 0)::bigint as total_views,
      (
        select count(*)::bigint from public.manga_comments mc
        where mc.manga_id = m.id and mc.is_active = true
          and mc.created_at >= now() - interval '30 days'
      ) as comment_count_30d
    from public.mangas m
    where m.fansub_id = p_fansub_id and m.is_active = true
    order by comment_count_30d desc, coalesce(m.total_views, 0) desc
    limit 5
  ),
  top_mangas as (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'id', tmr.id, 'title', tmr.title, 'slug', tmr.slug,
        'totalViews', tmr.total_views, 'commentCount', tmr.comment_count_30d
      ) order by tmr.comment_count_30d desc, tmr.total_views desc),
      '[]'::jsonb
    ) as items
    from top_manga_rows tmr
  ),
  recent_rows as (
    select t.id, t.title, t.category,
      coalesce(t.comments_count, 0) as comments_count,
      coalesce(t.reactions_count, 0) as reactions_count,
      t.updated_at
    from tagged t
    order by t.updated_at desc
    limit 5
  ),
  recent_posts as (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'id', rr.id, 'title', rr.title, 'category', rr.category,
        'commentsCount', rr.comments_count, 'reactionsCount', rr.reactions_count, 'at', rr.updated_at
      ) order by rr.updated_at desc),
      '[]'::jsonb
    ) as items
    from recent_rows rr
  )
  select jsonb_build_object(
    'signals', jsonb_build_object(
      'taggedTotal', s.tagged_total,
      'pendingCount', s.pending_count,
      'reportedCount', rp.reported_count
    ),
    'health', jsonb_build_object(
      'posts7d', s.posts_7d,
      'comments7d', cs.comments_7d,
      'reactions7d', rs.reactions_7d,
      'participants7d', pa.participants_7d,
      'members', mc.members
    ),
    'topMangas', tm.items,
    'recentPosts', rpst.items
  )
  into v_payload
  from signals s
  cross join reported rp
  cross join comment_stats cs
  cross join reaction_stats rs
  cross join participation pa
  cross join member_count mc
  cross join top_mangas tm
  cross join recent_posts rpst;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'signals', jsonb_build_object('taggedTotal', 0, 'pendingCount', 0, 'reportedCount', 0),
      'health', jsonb_build_object('posts7d', 0, 'comments7d', 0, 'reactions7d', 0, 'participants7d', 0, 'members', 0),
      'topMangas', '[]'::jsonb,
      'recentPosts', '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.list_fansub_tagged_community_feed(uuid, integer, integer, text, text) to authenticated;
grant execute on function public.get_fansub_manage_community_overview(uuid) to authenticated;

commit;
