-- One-call data RPC for the Fansub Studio "Overview" cockpit.
--
-- Why a separate RPC: get_fansub_manage_analytics_summary already carries overview/momentum/
-- statuses/topMangas/recentActivity. The cockpit design wants on top of these the
-- publish line, approval queue, upcoming releases, team breakdown and daily community
-- summary. Gathering these surfaces in one payload fills the screen on first open
-- without multiple fetches. The permission gate matches analytics summary exactly: site
-- admin or fansub staff (admin/moderator). It is NOT tied to a boost
-- capability; Overview is a working desk open to the whole fansub team.

begin;

create or replace function public.get_fansub_manage_overview_cockpit(
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

  if not exists (select 1 from public.fansubs where id = p_fansub_id) then
    raise exception 'Fansub bulunamadi.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id) or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansubun kokpit verisini gorme yetkiniz yok.';
  end if;

  with
  -- Publish line: chapter lifecycle states
  pipeline as (
    select
      count(*) filter (where c.is_active = false)::bigint as draft_count,
      count(*) filter (where c.is_active = true and c.is_approved = false)::bigint as pending_count,
      count(*) filter (
        where c.is_active = true
          and c.is_approved = true
          and coalesce(c.publish_at, c.created_at, now()) > now()
      )::bigint as scheduled_count,
      count(*) filter (
        where c.is_active = true
          and c.is_approved = true
          and coalesce(c.publish_at, c.created_at, now()) <= now()
      )::bigint as published_count,
      -- Problem: a chapter that should show as published but has no pages
      count(*) filter (
        where c.is_active = true
          and c.is_approved = true
          and coalesce(jsonb_array_length(case when jsonb_typeof(c.pages) = 'array' then c.pages else '[]'::jsonb end), 0) = 0
      )::bigint as problem_count
    from public.chapters c
    where c.fansub_id = p_fansub_id
  ),
  -- Approval queue: pending chapter + post + manga, newest 6 records
  queue_chapters as (
    select
      'chapter'::text as kind,
      c.id::text as id,
      coalesce(m.title, 'Adsiz manga') as title,
      ('Bolum ' || trim(to_char(c.chapter_number, 'FM999999990.##'))
        || coalesce(' · ' || nullif(c.title, ''), '')) as subtitle,
      coalesce(c.updated_at, c.created_at) as at
    from public.chapters c
    left join public.mangas m on m.id = c.manga_id
    where c.fansub_id = p_fansub_id
      and c.is_active = true
      and c.is_approved = false
    order by coalesce(c.updated_at, c.created_at) desc
    limit 6
  ),
  queue_posts as (
    select
      'post'::text as kind,
      cp.id::text as id,
      coalesce(nullif(cp.title, ''), 'Baslıksiz post') as title,
      coalesce('Kategori: ' || nullif(cp.category, ''), 'Topluluk gonderisi') as subtitle,
      cp.created_at as at
    from public.community_posts cp
    where cp.related_fansub_id = p_fansub_id
      and cp.is_active = true
      and cp.status = 'pending'
    order by cp.created_at desc
    limit 6
  ),
  queue_mangas as (
    select
      'manga'::text as kind,
      m.id::text as id,
      coalesce(m.title, 'Adsiz manga') as title,
      'Seri onayi bekliyor' as subtitle,
      coalesce(m.updated_at, m.created_at) as at
    from public.mangas m
    where m.fansub_id = p_fansub_id
      and m.is_approved = false
    order by coalesce(m.updated_at, m.created_at) desc
    limit 6
  ),
  queue_union as (
    select * from queue_chapters
    union all
    select * from queue_posts
    union all
    select * from queue_mangas
  ),
  approval_queue as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'kind', q.kind,
          'id', q.id,
          'title', q.title,
          'subtitle', q.subtitle,
          'at', q.at
        )
        order by q.at desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select * from queue_union order by at desc limit 6
    ) q
  ),
  -- Upcoming releases: planned chapters, nearest 5
  upcoming_rows as (
    select
      c.id,
      m.title as manga_title,
      m.slug as manga_slug,
      m.cover_image_url,
      c.chapter_number,
      c.title as chapter_title,
      c.publish_at
    from public.chapters c
    left join public.mangas m on m.id = c.manga_id
    where c.fansub_id = p_fansub_id
      and c.is_active = true
      and c.is_approved = true
      and coalesce(c.publish_at, c.created_at, now()) > now()
    order by c.publish_at asc nulls last
    limit 5
  ),
  upcoming as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ur.id,
          'mangaTitle', coalesce(ur.manga_title, 'Adsiz manga'),
          'mangaSlug', coalesce(ur.manga_slug, ''),
          'coverImageUrl', ur.cover_image_url,
          'chapterNumber', ur.chapter_number,
          'title', ur.chapter_title,
          'publishAt', ur.publish_at
        )
        order by ur.publish_at asc
      ),
      '[]'::jsonb
    ) as items
    from upcoming_rows ur
  ),
  -- Ekip kirilimi
  team_counts as (
    select
      count(*)::bigint as total,
      count(*) filter (where fm.role = 'admin')::bigint as admins,
      count(*) filter (where fm.role = 'moderator')::bigint as moderators,
      count(*) filter (where fm.role = 'member')::bigint as members
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
  ),
  team_tag_rows as (
    select
      fm.team_tag as tag,
      count(*)::bigint as count
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
      and nullif(trim(coalesce(fm.team_tag, '')), '') is not null
    group by fm.team_tag
    order by count(*) desc, fm.team_tag asc
  ),
  team_tags as (
    select coalesce(
      jsonb_agg(jsonb_build_object('tag', ttr.tag, 'count', ttr.count)),
      '[]'::jsonb
    ) as items
    from team_tag_rows ttr
  ),
  -- Daily community summary
  community_today as (
    select
      (
        select count(*)::bigint
        from public.community_comments cc
        join public.community_posts cp on cp.id = cc.post_id
        where cp.related_fansub_id = p_fansub_id
          and cc.is_active = true
          and cc.created_at >= date_trunc('day', now())
      )
      +
      (
        select count(*)::bigint
        from public.manga_comments mc
        join public.mangas m on m.id = mc.manga_id
        where m.fansub_id = p_fansub_id
          and mc.is_active = true
          and mc.created_at >= date_trunc('day', now())
      ) as comments_today,
      (
        select count(*)::bigint
        from public.community_post_likes cpl
        join public.community_posts cp on cp.id = cpl.post_id
        where cp.related_fansub_id = p_fansub_id
          and cpl.created_at >= date_trunc('day', now())
      ) as likes_today,
      (
        select count(*)::bigint
        from public.community_post_reactions cpr
        join public.community_posts cp on cp.id = cpr.post_id
        where cp.related_fansub_id = p_fansub_id
          and cpr.created_at >= date_trunc('day', now())
      ) as reactions_today,
      (
        select count(*)::bigint
        from public.community_posts cp
        where cp.related_fansub_id = p_fansub_id
          and cp.is_active = true
          and cp.created_at >= date_trunc('day', now())
      ) as posts_today
  ),
  -- Open reports (post + post comment targets)
  open_reports as (
    select count(*)::bigint as open_count
    from public.reports r
    where r.status = 'pending'
      and (
        (r.target_type = 'post' and exists (
          select 1 from public.community_posts cp
          where cp.id = r.target_id and cp.related_fansub_id = p_fansub_id
        ))
        or
        (r.target_type = 'comment' and exists (
          select 1
          from public.community_comments cc
          join public.community_posts cp on cp.id = cc.post_id
          where cc.id = r.target_id and cp.related_fansub_id = p_fansub_id
        ))
      )
  )
  select jsonb_build_object(
    'pipeline', jsonb_build_object(
      'draft', pl.draft_count,
      'pending', pl.pending_count,
      'scheduled', pl.scheduled_count,
      'published', pl.published_count,
      'problem', pl.problem_count
    ),
    'approvalQueue', aq.items,
    'upcoming', uc.items,
    'team', jsonb_build_object(
      'total', tc.total,
      'admins', tc.admins,
      'moderators', tc.moderators,
      'members', tc.members,
      'tags', tt.items
    ),
    'community', jsonb_build_object(
      'commentsToday', ct.comments_today,
      'likesToday', ct.likes_today,
      'reactionsToday', ct.reactions_today,
      'postsToday', ct.posts_today,
      'openReports', orp.open_count
    )
  )
  into v_payload
  from pipeline pl
  cross join approval_queue aq
  cross join upcoming uc
  cross join team_counts tc
  cross join team_tags tt
  cross join community_today ct
  cross join open_reports orp;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'pipeline', jsonb_build_object('draft', 0, 'pending', 0, 'scheduled', 0, 'published', 0, 'problem', 0),
      'approvalQueue', '[]'::jsonb,
      'upcoming', '[]'::jsonb,
      'team', jsonb_build_object('total', 0, 'admins', 0, 'moderators', 0, 'members', 0, 'tags', '[]'::jsonb),
      'community', jsonb_build_object('commentsToday', 0, 'likesToday', 0, 'reactionsToday', 0, 'postsToday', 0, 'openReports', 0)
    )
  );
end;
$$;

grant execute on function public.get_fansub_manage_overview_cockpit(uuid) to authenticated;

commit;
