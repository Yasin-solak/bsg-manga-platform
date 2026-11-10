-- Page-scoped id list for the "series with no chapters" view.
--
-- Why an RPC: this is an ANTI-JOIN ("manga with no chapters") and PostgREST cannot
-- express it. Other views (pending, inactive, fansubless, missing
-- header) are plain column conditions so they stay in the direct query.
--
-- Why `last_chapter_number` is NOT USED: measured, unreliable:
-- on live data 2 mangas with no chapters show nonzero, 1 manga
-- with chapters shows zero. A wrong queue is worse than an empty one.
--
-- Why PAGE-scoped: returning all matching ids and filtering on the client
-- would produce an id list too long for a URL as the catalog grows. Here
-- sorting and paging happen on the server; only that page's ids
-- pass over the wire. The total is returned separately so paging is right.

create or replace function app_private.get_admin_manga_control_empty_series_page(
  p_as_of timestamptz,
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
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu liste icin admin yetkisi gerekir.';
  end if;

  -- `nullif`/`coalesce` are SQL constructs and cannot be schema-qualified; `btrim` is a real function.
  v_search := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');

  with eslesen as (
    select m.id, m.updated_at
    from public.mangas as m
    where not exists (select 1 from public.chapters as c where c.manga_id = m.id)
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

create or replace function public.get_admin_manga_control_empty_series_page(
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
  select app_private.get_admin_manga_control_empty_series_page(
    pg_catalog.statement_timestamp(), p_search, p_visibility, p_approval, p_status, p_limit, p_offset
  );
$function$;

revoke all on function app_private.get_admin_manga_control_empty_series_page(timestamptz, text, text, text, text, integer, integer) from public;
revoke all on function public.get_admin_manga_control_empty_series_page(text, text, text, text, integer, integer) from public;
grant execute on function public.get_admin_manga_control_empty_series_page(text, text, text, text, integer, integer) to authenticated;

comment on function public.get_admin_manga_control_empty_series_page(text, text, text, text, integer, integer) is
  'Hic bolumu olmayan seriler icin sayfa-kapsamli kimlik listesi (admin). Anti-join oldugu icin PostgREST ile ifade edilemiyor.';
