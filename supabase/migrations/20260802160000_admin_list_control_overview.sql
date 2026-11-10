-- List management: server-side summary + computed views.
--
-- Why needed: the panel computed "Open / Private" counts FROM THE VISIBLE PAGE
-- (12 records per page). With 23 lists "Open" showed ~9 instead of 18.
-- The same bug fixed in manga control.
--
-- **Denormalized counters are not trusted.** `user_manga_lists.comments_count`
-- was measured and on live data does not match the real comment count on 1 row. So the summary
-- counts everything FROM SOURCE TABLES; the drift itself is also returned as a metric
-- (`counterDrift`) because silently showing a wrong number
-- is worse than showing nothing.
--
-- The security pattern matches the others: SECURITY DEFINER + admin/service_role
-- gate + search_path=''. The `app_private` EXECUTE grant MUST NOT BE FORGOTTEN:
-- the `public.*` wrapper is not security definer, the call proceeds with the caller
-- rights (see PR #86).

create or replace function app_private.get_admin_list_control_overview(p_as_of timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_total integer;
  v_public integer;
  v_private integer;
  v_empty integer;
  v_without_cover integer;
  v_owners integer;
  v_new_current integer;
  v_new_previous integer;
  v_counter_drift integer;
  v_items_total integer;
  v_comments_total integer;
  v_comments_inactive integer;
  v_comments_spoiler integer;
  v_lists_with_inactive integer;
  v_ratings_total integer;
  v_rating_avg numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu ozet icin admin yetkisi gerekir.';
  end if;

  if p_as_of is null then
    raise exception using errcode = '22023', message = 'Ozet referans zamani bos olamaz.';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where l.is_public)::integer,
    pg_catalog.count(*) filter (where not l.is_public)::integer,
    -- Empty list: a dead end for visitors. REAL items are counted, not the counter.
    pg_catalog.count(*) filter (
      where not exists (select 1 from public.user_manga_list_items as i where i.list_id = l.id)
    )::integer,
    pg_catalog.count(*) filter (where l.cover_manga_id is null)::integer,
    pg_catalog.count(distinct l.owner_id)::integer,
    pg_catalog.count(*) filter (where l.created_at >= p_as_of - interval '7 days' and l.created_at < p_as_of)::integer,
    pg_catalog.count(*) filter (where l.created_at >= p_as_of - interval '14 days' and l.created_at < p_as_of - interval '7 days')::integer,
    -- Denormalize sayac kaymasi: veri butunlugu sinyali.
    pg_catalog.count(*) filter (
      where l.items_count <> (select pg_catalog.count(*) from public.user_manga_list_items as i where i.list_id = l.id)
         or l.comments_count <> (select pg_catalog.count(*) from public.user_manga_list_comments as c where c.list_id = l.id)
    )::integer,
    pg_catalog.count(*) filter (
      where exists (
        select 1 from public.user_manga_list_comments as c
        where c.list_id = l.id and not c.is_active
      )
    )::integer
  into
    v_total, v_public, v_private, v_empty, v_without_cover, v_owners,
    v_new_current, v_new_previous, v_counter_drift, v_lists_with_inactive
  from public.user_manga_lists as l;

  select pg_catalog.count(*)::integer into v_items_total
  from public.user_manga_list_items;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where not c.is_active)::integer,
    pg_catalog.count(*) filter (where c.is_spoiler)::integer
  into v_comments_total, v_comments_inactive, v_comments_spoiler
  from public.user_manga_list_comments as c;

  select pg_catalog.count(*)::integer, pg_catalog.round(pg_catalog.avg(r.rating), 2)
  into v_ratings_total, v_rating_avg
  from public.user_manga_list_ratings as r;

  return pg_catalog.jsonb_build_object(
    'generatedAt', p_as_of,
    'total', coalesce(v_total, 0),
    'publicLists', coalesce(v_public, 0),
    'privateLists', coalesce(v_private, 0),
    'emptyLists', coalesce(v_empty, 0),
    'withoutCover', coalesce(v_without_cover, 0),
    'owners', coalesce(v_owners, 0),
    'itemsTotal', coalesce(v_items_total, 0),
    'commentsTotal', coalesce(v_comments_total, 0),
    'commentsInactive', coalesce(v_comments_inactive, 0),
    'commentsSpoiler', coalesce(v_comments_spoiler, 0),
    'listsWithInactiveComments', coalesce(v_lists_with_inactive, 0),
    'ratingsTotal', coalesce(v_ratings_total, 0),
    'ratingAverage', v_rating_avg,
    'counterDrift', coalesce(v_counter_drift, 0),
    'newListsCurrent', coalesce(v_new_current, 0),
    'newListsPrevious', coalesce(v_new_previous, 0),
    'newListsDelta', coalesce(v_new_current, 0) - coalesce(v_new_previous, 0),
    'newListsDeltaPercent', case
      when coalesce(v_new_previous, 0) > 0 then pg_catalog.round(
        ((coalesce(v_new_current, 0) - v_new_previous) * 100.0) / v_new_previous, 2
      )
      else null
    end
  );
end;
$function$;

create or replace function public.get_admin_list_control_overview()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select app_private.get_admin_list_control_overview(pg_catalog.statement_timestamp());
$function$;

-- Page-scoped id list for computed views.
--
-- `empty` is an ANTI-JOIN, `moderation` an EXISTS; PostgREST cannot express
-- either. Other views (private list, coverless) are plain column conditions so
-- they stay in the query.
create or replace function app_private.get_admin_list_control_view_page(
  p_as_of timestamptz,
  p_view text,
  p_search text,
  p_visibility text,
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
  v_view := coalesce(p_view, 'empty');

  if v_view not in ('empty', 'moderation') then
    raise exception using errcode = '22023', message = 'Bilinmeyen gorunum.';
  end if;

  with eslesen as (
    select l.id, l.updated_at
    from public.user_manga_lists as l
    where (
        (v_view = 'empty'
         and not exists (select 1 from public.user_manga_list_items as i where i.list_id = l.id))
        or
        (v_view = 'moderation'
         and exists (select 1 from public.user_manga_list_comments as c where c.list_id = l.id and not c.is_active))
      )
      and (p_visibility is null or p_visibility = 'all'
           or (p_visibility = 'public' and l.is_public)
           or (p_visibility = 'private' and not l.is_public))
      and (
        v_search is null
        or l.title ilike '%' || v_search || '%'
        or coalesce(l.description, '') ilike '%' || v_search || '%'
        or exists (
          select 1 from public.users as u
          where u.id = l.owner_id
            and (u.username ilike '%' || v_search || '%' or coalesce(u.display_name, '') ilike '%' || v_search || '%')
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
    limit greatest(coalesce(p_limit, 12), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  ) as sayfa;

  return pg_catalog.jsonb_build_object(
    'generatedAt', coalesce(p_as_of, pg_catalog.statement_timestamp()),
    'ids', pg_catalog.to_jsonb(coalesce(v_ids, array[]::uuid[])),
    'total', coalesce(v_total, 0)
  );
end;
$function$;

create or replace function public.get_admin_list_control_view_page(
  p_view text default 'empty',
  p_search text default null,
  p_visibility text default 'all',
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select app_private.get_admin_list_control_view_page(
    pg_catalog.statement_timestamp(), p_view, p_search, p_visibility, p_limit, p_offset
  );
$function$;

-- Permissions. Every migration writing `revoke ... from public` must give `authenticated`
-- EXECUTE; otherwise the `public.*` wrapper (NOT security definer)
-- cannot reach app_private and the RPC dies for a real admin too.
revoke all on function app_private.get_admin_list_control_overview(timestamptz) from public;
revoke all on function app_private.get_admin_list_control_view_page(timestamptz, text, text, text, integer, integer) from public;
revoke all on function public.get_admin_list_control_overview() from public;
revoke all on function public.get_admin_list_control_view_page(text, text, text, integer, integer) from public;

grant execute on function app_private.get_admin_list_control_overview(timestamptz) to authenticated, service_role;
grant execute on function app_private.get_admin_list_control_view_page(timestamptz, text, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.get_admin_list_control_overview() to authenticated;
grant execute on function public.get_admin_list_control_view_page(text, text, text, integer, integer) to authenticated;

comment on function public.get_admin_list_control_overview() is
  'Liste yonetimi ozeti (admin). Sayfa degil TUM veri uzerinden, denormalize sayaclara guvenmeden hesaplanir.';
comment on function public.get_admin_list_control_view_page(text, text, text, integer, integer) is
  'Hesaplanmis liste gorunumleri (bos liste / moderasyon bekleyen). PostgREST anti-join ve EXISTS ifade edemiyor.';
