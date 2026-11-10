-- Manga control: page-scoped id list for computed views.
--
-- FIXING THE PREVIOUS VERSION: `get_admin_manga_control_empty_series_page`
-- knew only the "series with no chapters" view and the panel alongside
-- showed "fansubless series" like a problem. This WENT AGAINST THE PRODUCT MODEL:
-- mangas are a SHARED CATALOG, no ownership. Any fansub wanting a manga's chapters
-- can translate and upload; the permission key is `chapters.fansub_id`,
-- not `mangas.fansub_id`. So "fansubless manga" is not a deficiency.
--
-- In its place goes the admin's REAL job: reviewing whether uploaded chapters meet
-- the criteria. "Series with pending chapters" is its queue.
--
-- Neither view can be expressed with PostgREST (one anti-join, the other
-- EXISTS), so they are on the server. Sorting and paging happen here; only that
-- page's ids pass over the wire.

drop function if exists public.get_admin_manga_control_empty_series_page(text, text, text, text, integer, integer);
drop function if exists app_private.get_admin_manga_control_empty_series_page(timestamptz, text, text, text, text, integer, integer);

create or replace function app_private.get_admin_manga_control_view_page(
  p_as_of timestamptz,
  p_view text,
  p_search text,
  p_visibility text,
  p_approval text,
  p_status text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_ids uuid[];
  v_total integer;
  v_search text;
  v_view text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu liste icin admin yetkisi gerekir.';
  end if;

  v_search := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  v_view := coalesce(p_view, 'without-chapters');

  if v_view not in ('without-chapters', 'pending-chapters') then
    raise exception using errcode = '22023', message = 'Bilinmeyen gorunum.';
  end if;

  with eslesen as (
    select m.id, m.updated_at
    from public.mangas as m
    where (
        (v_view = 'without-chapters'
         and not exists (select 1 from public.chapters as c where c.manga_id = m.id))
        or
        (v_view = 'pending-chapters'
         and exists (select 1 from public.chapters as c where c.manga_id = m.id and not c.is_approved))
      )
      and (p_visibility is null or p_visibility = 'all'
           or (p_visibility = 'active' and m.is_active)
           or (p_visibility = 'inactive' and not m.is_active))
      and (p_approval is null or p_approval = 'all'
           or (p_approval = 'approved' and m.is_approved)
           or (p_approval = 'pending' and not m.is_approved))
      and (p_status is null or p_status = 'all' or m.status = p_status)
      and (
        v_search is null
        or m.title ilike '%' || v_search || '%'
        or m.slug ilike '%' || v_search || '%'
        or coalesce(m.description, '') ilike '%' || v_search || '%'
        or exists (
          select 1 from public.fansubs as f
          where f.id = m.fansub_id and f.name ilike '%' || v_search || '%'
        )
      )
  )
  select
    pg_catalog.array_agg(sayfa.id order by sayfa.updated_at desc nulls last),
    (select pg_catalog.count(*)::integer from eslesen)
  into v_ids, v_total
  from (
    select e.id, e.updated_at
    from eslesen as e
    order by e.updated_at desc nulls last
    limit greatest(coalesce(p_limit, 20), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  ) as sayfa;

  return pg_catalog.jsonb_build_object(
    'generatedAt', coalesce(p_as_of, pg_catalog.statement_timestamp()),
    'ids', pg_catalog.to_jsonb(coalesce(v_ids, array[]::uuid[])),
    'total', coalesce(v_total, 0)
  );
end;
$function$;

create or replace function public.get_admin_manga_control_view_page(
  p_view text default 'without-chapters',
  p_search text default null,
  p_visibility text default 'all',
  p_approval text default 'all',
  p_status text default 'all',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select app_private.get_admin_manga_control_view_page(
    pg_catalog.statement_timestamp(), p_view, p_search, p_visibility, p_approval, p_status, p_limit, p_offset
  );
$function$;

revoke all on function app_private.get_admin_manga_control_view_page(timestamptz, text, text, text, text, text, integer, integer) from public;
revoke all on function public.get_admin_manga_control_view_page(text, text, text, text, text, integer, integer) from public;
grant execute on function public.get_admin_manga_control_view_page(text, text, text, text, text, integer, integer) to authenticated;

comment on function public.get_admin_manga_control_view_page(text, text, text, text, text, integer, integer) is
  'Hesaplanmis manga kontrol gorunumleri (bolumsuz seri / bekleyen bolumu olan seri). PostgREST anti-join ve EXISTS ifade edemedigi icin sunucuda.';
