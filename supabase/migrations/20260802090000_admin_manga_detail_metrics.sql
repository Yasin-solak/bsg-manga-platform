-- Admin metrics for one manga.
--
-- The detail window so far showed only the summary from the list
-- (chapter count, views, rating). As admins far more can be gathered
-- and most of it CHANGES DECISIONS:
--
-- * Publishing pace and last chapter date -> is the series dead or alive.
-- * Chapter with no pages -> a broken upload; must be caught before approval.
-- * Monthly view trend -> should it be featured in the catalog.
-- * Reader count (not views) -> real interest.
-- * Inactive/spoiler comments -> moderation load.
--
-- Report count is DELIBERATELY ABSENT: `fansub_reported_content` today carries only the `post`
-- target type; for manga/chapter it always returns 0 and would give a false sense
-- of "no reports at all".
--
-- The security pattern matches the others: SECURITY DEFINER + admin/service_role
-- gate + search_path=''.

create or replace function app_private.get_admin_manga_detail_metrics(
  p_as_of timestamptz,
  p_manga_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_readers_total integer;
  v_readers_30d integer;
  v_last_read_at timestamptz;
  v_followers integer;
  v_views_current integer;
  v_views_previous integer;
  v_chapter_numbers integer;
  v_chapter_versions integer;
  v_pending integer;
  v_scheduled integer;
  v_inactive integer;
  v_empty_pages integer;
  v_pages_total bigint;
  v_first_chapter_at timestamptz;
  v_last_chapter_at timestamptz;
  v_contributors integer;
  v_comments integer;
  v_comments_inactive integer;
  v_comments_spoiler integer;
  v_ratings integer;
  v_rating_avg numeric;
  v_month_start date;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu metrikler icin admin yetkisi gerekir.';
  end if;

  if p_manga_id is null then
    raise exception using errcode = '22023', message = 'Manga kimligi bos olamaz.';
  end if;

  v_month_start := pg_catalog.date_trunc('month', p_as_of)::date;

  -- Readers: UNIQUE user count, unlike views.
  select
    pg_catalog.count(distinct rh.user_id)::integer,
    pg_catalog.count(distinct rh.user_id) filter (where rh.read_at >= p_as_of - interval '30 days')::integer,
    pg_catalog.max(rh.read_at)
  into v_readers_total, v_readers_30d, v_last_read_at
  from public.reading_history as rh
  where rh.manga_id = p_manga_id;

  select pg_catalog.count(*)::integer into v_followers
  from public.manga_follows as mf where mf.manga_id = p_manga_id;

  select
    coalesce(pg_catalog.sum(v.views) filter (where v.month_start = v_month_start), 0)::integer,
    coalesce(pg_catalog.sum(v.views) filter (where v.month_start = (v_month_start - interval '1 month')::date), 0)::integer
  into v_views_current, v_views_previous
  from public.manga_monthly_views as v
  where v.manga_id = p_manga_id;

  select
    pg_catalog.count(distinct c.chapter_number)::integer,
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where not c.is_approved)::integer,
    pg_catalog.count(*) filter (where c.publish_at is not null and c.publish_at > p_as_of)::integer,
    pg_catalog.count(*) filter (where not c.is_active)::integer,
    -- A chapter with no pages: the upload stopped midway.
    pg_catalog.count(*) filter (
      where c.pages is null or pg_catalog.jsonb_array_length(c.pages) = 0
    )::integer,
    coalesce(pg_catalog.sum(
      case when c.pages is null then 0 else pg_catalog.jsonb_array_length(c.pages) end
    ), 0),
    pg_catalog.min(c.created_at),
    pg_catalog.max(c.created_at),
    pg_catalog.count(distinct c.fansub_id)::integer
  into
    v_chapter_numbers, v_chapter_versions, v_pending, v_scheduled, v_inactive,
    v_empty_pages, v_pages_total, v_first_chapter_at, v_last_chapter_at, v_contributors
  from public.chapters as c
  where c.manga_id = p_manga_id;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where not mc.is_active)::integer,
    pg_catalog.count(*) filter (where mc.is_spoiler)::integer
  into v_comments, v_comments_inactive, v_comments_spoiler
  from public.manga_comments as mc
  where mc.manga_id = p_manga_id;

  select pg_catalog.count(*)::integer, pg_catalog.round(pg_catalog.avg(mr.rating), 2)
  into v_ratings, v_rating_avg
  from public.manga_ratings as mr
  where mr.manga_id = p_manga_id;

  return pg_catalog.jsonb_build_object(
    'generatedAt', p_as_of,
    'readersTotal', coalesce(v_readers_total, 0),
    'readers30d', coalesce(v_readers_30d, 0),
    'lastReadAt', v_last_read_at,
    'followers', coalesce(v_followers, 0),
    'viewsCurrentMonth', coalesce(v_views_current, 0),
    'viewsPreviousMonth', coalesce(v_views_previous, 0),
    'chapterNumbers', coalesce(v_chapter_numbers, 0),
    'chapterVersions', coalesce(v_chapter_versions, 0),
    'pendingChapters', coalesce(v_pending, 0),
    'scheduledChapters', coalesce(v_scheduled, 0),
    'inactiveChapters', coalesce(v_inactive, 0),
    'emptyPageChapters', coalesce(v_empty_pages, 0),
    'pagesTotal', coalesce(v_pages_total, 0),
    'firstChapterAt', v_first_chapter_at,
    'lastChapterAt', v_last_chapter_at,
    -- Publishing pace: average days between two chapters. Meaningless on a single-chapter
    -- series so it returns null.
    'avgChapterIntervalDays', case
      when coalesce(v_chapter_numbers, 0) > 1
        and v_first_chapter_at is not null
        and v_last_chapter_at is not null
      -- `extract(... from ...)` parser sozdizimi, sema nitelenemez.
      then pg_catalog.round(
        (extract(epoch from (v_last_chapter_at - v_first_chapter_at)) / 86400.0)
          / (v_chapter_numbers - 1), 1)
      else null
    end,
    'contributorFansubs', coalesce(v_contributors, 0),
    'comments', coalesce(v_comments, 0),
    'commentsInactive', coalesce(v_comments_inactive, 0),
    'commentsSpoiler', coalesce(v_comments_spoiler, 0),
    'ratings', coalesce(v_ratings, 0),
    'ratingAverage', v_rating_avg
  );
end;
$function$;

create or replace function public.get_admin_manga_detail_metrics(p_manga_id uuid)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select app_private.get_admin_manga_detail_metrics(pg_catalog.statement_timestamp(), p_manga_id);
$function$;

revoke all on function app_private.get_admin_manga_detail_metrics(timestamptz, uuid) from public;
revoke all on function public.get_admin_manga_detail_metrics(uuid) from public;
grant execute on function public.get_admin_manga_detail_metrics(uuid) to authenticated;

comment on function public.get_admin_manga_detail_metrics(uuid) is
  'Tek manga icin admin metrikleri: okur, takipci, aylik trend, yayin temposu, bozuk yukleme ve moderasyon yuku.';
