-- MangaZone | User level read models
-- Profile privacy is kept; the admin list is enriched with progress data in one RPC
-- and XP events open only in the admin detail.

begin;

create or replace function app_private.build_user_progression_payload(
  p_user_id uuid,
  p_include_stats boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_ruleset_version smallint;
  v_total_xp bigint;
  v_level_number smallint;
  v_title text;
  v_current_min bigint;
  v_next_min bigint;
  v_xp_into_level bigint;
  v_xp_for_next bigint;
  v_xp_to_next bigint;
  v_progress_percent integer;
begin
  select s.ruleset_version, s.total_xp, s.level_number
  into v_ruleset_version, v_total_xp, v_level_number
  from public.user_level_snapshots as s
  where s.user_id = p_user_id;

  if not found then
    select r.version
    into v_ruleset_version
    from public.user_level_rulesets as r
    where r.is_active = true
    order by r.version desc
    limit 1;
    v_total_xp := 0;

    select t.level_number
    into v_level_number
    from public.user_level_thresholds as t
    where t.ruleset_version = v_ruleset_version
    order by t.min_total_xp asc
    limit 1;
  end if;

  select t.title, t.min_total_xp
  into v_title, v_current_min
  from public.user_level_thresholds as t
  where t.ruleset_version = v_ruleset_version
    and t.level_number = v_level_number;

  if not found then
    return null;
  end if;

  select t.min_total_xp
  into v_next_min
  from public.user_level_thresholds as t
  where t.ruleset_version = v_ruleset_version
    and t.min_total_xp > v_current_min
  order by t.min_total_xp asc
  limit 1;

  v_xp_into_level := greatest(v_total_xp - v_current_min, 0);
  if v_next_min is null then
    v_xp_for_next := null;
    v_xp_to_next := null;
    v_progress_percent := 100;
  else
    v_xp_for_next := v_next_min - v_current_min;
    v_xp_to_next := greatest(v_next_min - v_total_xp, 0);
    v_progress_percent := least(
      100,
      greatest(
        0,
        pg_catalog.floor((v_xp_into_level * 100.0) / nullif(v_xp_for_next, 0))::integer
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'rulesetVersion', v_ruleset_version,
    'levelNumber', v_level_number,
    'title', v_title,
    'totalXp', case when p_include_stats then v_total_xp else null end,
    'currentLevelXp', case when p_include_stats then v_xp_into_level else null end,
    'nextLevelXp', case when p_include_stats then v_xp_for_next else null end,
    'xpToNextLevel', case when p_include_stats then v_xp_to_next else null end,
    'progressPercent', case when p_include_stats then v_progress_percent else null end,
    'isMaxLevel', v_next_min is null
  );
end;
$function$;

create or replace function app_private.get_public_user_progression(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_access record;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Kullanıcı kimliği zorunludur.';
  end if;

  select *
  into v_access
  from public.get_profile_view_access(p_user_id)
  limit 1;

  if not coalesce(v_access.profile_visible, false) then
    raise exception using errcode = '42501', message = 'Bu profil görüntülenemez.';
  end if;

  return app_private.build_user_progression_payload(
    p_user_id,
    coalesce(v_access.stats_visible, false)
  );
end;
$function$;

create or replace function public.get_public_user_progression(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_public_user_progression(p_user_id);
$function$;

create or replace function app_private.get_my_user_progression()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := app_private.current_public_user_id();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Bu işlem için giriş yapmalısınız.';
  end if;
  return app_private.build_user_progression_payload(v_user_id, true);
end;
$function$;

create or replace function public.get_my_user_progression()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_my_user_progression();
$function$;

create or replace function app_private.get_admin_user_progression(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_progression jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu ilerleme detayı için admin yetkisi gerekir.';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Kullanıcı kimliği zorunludur.';
  end if;
  if not exists (select 1 from public.users as u where u.id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'Kullanıcı bulunamadı.';
  end if;

  v_progression := app_private.build_user_progression_payload(p_user_id, true);
  return v_progression || pg_catalog.jsonb_build_object(
    'events', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', e.id,
          'xpDelta', e.xp_delta,
          'reasonCode', e.reason_code,
          'sourceType', e.source_type,
          'sourceRef', e.source_ref,
          'occurredAt', e.occurred_at,
          'metadata', e.metadata
        ) order by e.created_at desc, e.id desc
      )
      from (
        select x.*
        from app_private.user_xp_events as x
        where x.user_id = p_user_id
        order by x.created_at desc, x.id desc
        limit 20
      ) as e
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.get_admin_user_progression(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_admin_user_progression(p_user_id);
$function$;

create or replace function app_private.list_admin_user_management_page_v2(
  p_limit integer,
  p_search text,
  p_view text,
  p_role text,
  p_verification text,
  p_trust_band text,
  p_fansub text,
  p_cursor_created_at timestamptz,
  p_cursor_user_id uuid,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_payload jsonb;
  v_items jsonb;
begin
  v_payload := app_private.list_admin_user_management_page(
    p_limit,
    p_search,
    p_view,
    p_role,
    p_verification,
    p_trust_band,
    p_fansub,
    p_cursor_created_at,
    p_cursor_user_id,
    p_as_of
  );

  with payload_items as (
    select value as item, ordinality
    from pg_catalog.jsonb_array_elements(coalesce(v_payload -> 'items', '[]'::jsonb))
      with ordinality
  ), enriched as (
    select
      p.ordinality,
      p.item || pg_catalog.jsonb_build_object(
        'progression', app_private.build_user_progression_payload(
          (p.item ->> 'id')::uuid,
          true
        )
      ) as item
    from payload_items as p
  )
  select coalesce(pg_catalog.jsonb_agg(e.item order by e.ordinality), '[]'::jsonb)
  into v_items
  from enriched as e;

  return pg_catalog.jsonb_set(v_payload, '{items}', v_items, true);
end;
$function$;

create or replace function public.list_admin_user_management_page_v2(
  p_limit integer default 10,
  p_search text default null,
  p_view text default 'all',
  p_role text default 'all',
  p_verification text default 'all',
  p_trust_band text default 'all',
  p_fansub text default 'all',
  p_cursor_created_at timestamptz default null,
  p_cursor_user_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.list_admin_user_management_page_v2(
    p_limit,
    p_search,
    p_view,
    p_role,
    p_verification,
    p_trust_band,
    p_fansub,
    p_cursor_created_at,
    p_cursor_user_id,
    pg_catalog.statement_timestamp()
  );
$function$;

create or replace function app_private.get_admin_user_management_preview_v2(
  p_user_id uuid,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_payload jsonb;
  v_display_name text;
begin
  v_payload := app_private.get_admin_user_management_preview(p_user_id, p_as_of);

  select coalesce(nullif(pg_catalog.btrim(u.display_name), ''), u.username)
  into v_display_name
  from public.users as u
  where u.id = p_user_id;

  v_payload := pg_catalog.jsonb_set(
    v_payload,
    '{profile,displayName}',
    pg_catalog.to_jsonb(coalesce(
      nullif(pg_catalog.btrim(v_display_name), ''),
      v_payload #>> '{profile,username}'
    )),
    true
  );

  return v_payload || pg_catalog.jsonb_build_object(
    'progression', app_private.build_user_progression_payload(p_user_id, true)
  );
end;
$function$;

create or replace function public.get_admin_user_management_preview_v2(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_admin_user_management_preview_v2(
    p_user_id,
    pg_catalog.statement_timestamp()
  );
$function$;

revoke all on function app_private.build_user_progression_payload(uuid, boolean)
  from public, anon, authenticated;

revoke all on function app_private.get_public_user_progression(uuid)
  from public, anon, authenticated;
grant execute on function app_private.get_public_user_progression(uuid)
  to anon, authenticated;
revoke all on function public.get_public_user_progression(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_user_progression(uuid)
  to anon, authenticated;

revoke all on function app_private.get_my_user_progression()
  from public, anon, authenticated;
grant execute on function app_private.get_my_user_progression()
  to authenticated;
revoke all on function public.get_my_user_progression()
  from public, anon, authenticated;
grant execute on function public.get_my_user_progression()
  to authenticated;

revoke all on function app_private.get_admin_user_progression(uuid)
  from public, anon, authenticated;
grant execute on function app_private.get_admin_user_progression(uuid)
  to authenticated, service_role;
revoke all on function public.get_admin_user_progression(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_user_progression(uuid)
  to authenticated, service_role;

revoke all on function app_private.list_admin_user_management_page_v2(
  integer, text, text, text, text, text, text, timestamptz, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.list_admin_user_management_page_v2(
  integer, text, text, text, text, text, text, timestamptz, uuid, timestamptz
) to authenticated, service_role;
revoke all on function public.list_admin_user_management_page_v2(
  integer, text, text, text, text, text, text, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.list_admin_user_management_page_v2(
  integer, text, text, text, text, text, text, timestamptz, uuid
) to authenticated, service_role;

revoke all on function app_private.get_admin_user_management_preview_v2(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function app_private.get_admin_user_management_preview_v2(uuid, timestamptz)
  to authenticated, service_role;
revoke all on function public.get_admin_user_management_preview_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_user_management_preview_v2(uuid)
  to authenticated, service_role;

comment on function public.get_public_user_progression(uuid) is
  'Profil ve istatistik gizliligi kurallarini koruyarak kullanici seviye ilerlemesini dondurur.';
comment on function public.get_admin_user_progression(uuid) is
  'Admin icin toplam XP, ilerleme ve son 20 degistirilemez XP olayini dondurur.';
comment on function public.list_admin_user_management_page_v2(
  integer, text, text, text, text, text, text, timestamptz, uuid
) is 'En fazla 10 kullaniciyi seviye ilerlemesiyle tek admin RPC payloadinda dondurur.';

notify pgrst, 'reload schema';
commit;
