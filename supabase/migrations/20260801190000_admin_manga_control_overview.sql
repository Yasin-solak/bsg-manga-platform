-- Server-side summary for the manga control panel.
--
-- Why needed: the panel so far computed the summary FROM THE VISIBLE PAGE
-- (mangas.reduce). While showing a page of 20 in a 96-manga catalog it said "Approved:
-- 20": the number looks right but does not represent the whole catalog.
-- User management already does this with one summary function on the server;
-- the manga side moves to the same pattern.
--
-- The schema/security pattern is deliberately the same as `app_private.get_admin_user_management_overview`:
-- SECURITY DEFINER + admin/service_role gate + `search_path=''` +
-- jsonb output + 7 days / previous 7 days comparison.

create or replace function app_private.get_admin_manga_control_overview(p_as_of timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_current_start timestamptz;
  v_previous_start timestamptz;
  v_total integer;
  v_approved integer;
  v_pending integer;
  v_inactive integer;
  v_without_fansub integer;
  v_without_chapters integer;
  v_incomplete_meta integer;
  v_pending_chapter_series integer;
  v_new_current integer;
  v_new_previous integer;
  v_chapters_total integer;
  v_chapters_pending integer;
  v_chapters_scheduled integer;
  v_chapters_without_fansub integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu ozet icin admin yetkisi gerekir.';
  end if;

  if p_as_of is null then
    raise exception using errcode = '22023', message = 'Ozet referans zamani bos olamaz.';
  end if;

  v_current_start := p_as_of - interval '7 days';
  v_previous_start := p_as_of - interval '14 days';

  -- Manga side in one scan.
  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where m.is_approved)::integer,
    pg_catalog.count(*) filter (where not m.is_approved)::integer,
    pg_catalog.count(*) filter (where not m.is_active)::integer,
    -- NOTE: this is NOT ownerlessness. Mangas are a shared catalog; `mangas.fansub_id`
    -- is only a trace of the team opening the catalog record. It does not show as a warning
    -- in the panel, kept as info only.
    pg_catalog.count(*) filter (where m.fansub_id is null)::integer,
    -- A series with no chapters: a dead end for readers.
    pg_catalog.count(*) filter (
      where not exists (select 1 from public.chapters as c where c.manga_id = m.id)
    )::integer,
    -- Missing header: card and SEO surfaces look broken without these.
    pg_catalog.count(*) filter (
      where m.cover_image_url is null
         or pg_catalog.btrim(m.cover_image_url) = ''
         or m.genres is null
         or pg_catalog.cardinality(m.genres) = 0
         or m.description is null
         or pg_catalog.btrim(m.description) = ''
    )::integer,
    -- The admin's real job queue: whether an uploaded chapter meets the criteria must be
    -- reviewed. There is no manga ownership; review is per CHAPTER.
    pg_catalog.count(*) filter (
      where exists (select 1 from public.chapters as c where c.manga_id = m.id and not c.is_approved)
    )::integer,
    pg_catalog.count(*) filter (where m.created_at >= v_current_start and m.created_at < p_as_of)::integer,
    pg_catalog.count(*) filter (where m.created_at >= v_previous_start and m.created_at < v_current_start)::integer
  into
    v_total, v_approved, v_pending, v_inactive,
    v_without_fansub, v_without_chapters, v_incomplete_meta, v_pending_chapter_series,
    v_new_current, v_new_previous
  from public.mangas as m;

  -- Chapter side in a separate scan: counted directly instead of summing per manga.
  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where not c.is_approved)::integer,
    pg_catalog.count(*) filter (where c.publish_at is not null and c.publish_at > p_as_of)::integer,
    pg_catalog.count(*) filter (where c.fansub_id is null)::integer
  into v_chapters_total, v_chapters_pending, v_chapters_scheduled, v_chapters_without_fansub
  from public.chapters as c;

  return pg_catalog.jsonb_build_object(
    'generatedAt', p_as_of,
    'total', coalesce(v_total, 0),
    'approved', coalesce(v_approved, 0),
    'pending', coalesce(v_pending, 0),
    'inactive', coalesce(v_inactive, 0),
    'withoutFansub', coalesce(v_without_fansub, 0),
    'withoutChapters', coalesce(v_without_chapters, 0),
    'incompleteMeta', coalesce(v_incomplete_meta, 0),
    'pendingChapterSeries', coalesce(v_pending_chapter_series, 0),
    'chaptersTotal', coalesce(v_chapters_total, 0),
    'chaptersPending', coalesce(v_chapters_pending, 0),
    'chaptersScheduled', coalesce(v_chapters_scheduled, 0),
    'chaptersWithoutFansub', coalesce(v_chapters_without_fansub, 0),
    'newMangasCurrent', coalesce(v_new_current, 0),
    'newMangasPrevious', coalesce(v_new_previous, 0),
    'newMangasDelta', coalesce(v_new_current, 0) - coalesce(v_new_previous, 0),
    'newMangasDeltaPercent', case
      when coalesce(v_new_previous, 0) > 0 then pg_catalog.round(
        ((coalesce(v_new_current, 0) - v_new_previous) * 100.0) / v_new_previous, 2
      )
      else null
    end
  );
end;
$function$;

create or replace function public.get_admin_manga_control_overview()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select app_private.get_admin_manga_control_overview(pg_catalog.statement_timestamp());
$function$;

revoke all on function app_private.get_admin_manga_control_overview(timestamptz) from public;
revoke all on function public.get_admin_manga_control_overview() from public;
grant execute on function public.get_admin_manga_control_overview() to authenticated;

comment on function public.get_admin_manga_control_overview() is
  'Manga kontrol paneli ozeti (admin). Sayfa degil TUM katalog uzerinden hesaplanir.';
