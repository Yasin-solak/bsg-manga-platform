-- Translation Studio unlocks and scales with fansub boost tiers.
--
-- Rule: 10 AI pages a day per point of boost power, counted at the tier floor.
--   tier 0 (power 0-2)  : studio locked
--   tier 1 (power >= 3) :  30 pages / day
--   tier 2 (power >= 6) :  60 pages / day
--   tier 3 (power >= 12): 120 pages / day
-- Measured cost with Claude Haiku 5.5 is about USD 0.0024 per long webtoon page (0.003 with
-- retries), so a fully used tier costs at most about 2.7 / 5.4 / 10.8 USD a month.
--
-- The per-tier numbers live in feature_flags 'translation.studio_v3' metadata.tier_page_limits
-- (e.g. {"1": 30, "2": 60, "3": 120}) so they can change without a migration. A row in
-- translation_fansub_quotas still overrides everything and also unlocks the studio (manual grant).
-- Site admins are never limited.

create or replace function app_private.tl_tier_page_limit(p_tier integer)
returns integer language sql stable security definer set search_path = '' as $function$
  -- A hand-edited value that is not a whole number falls back to the default instead of
  -- breaking every AI call.
  select case when coalesce(p_tier, 0) <= 0 then 0 else coalesce(
    (select case when v.value ~ '^[0-9]{1,5}$' then v.value::integer end
       from public.feature_flags f
       cross join lateral (select f.metadata -> 'tier_page_limits' ->> least(p_tier, 3)::text as value) v
       where f.key = 'translation.studio_v3'),
    case least(p_tier, 3) when 1 then 30 when 2 then 60 else 120 end) end;
$function$;

create or replace function app_private.tl_fansub_tier(p_fansub_id uuid)
returns integer language sql stable security definer set search_path = '' as $function$
  select coalesce((select s.tier_level from public.fansub_boost_snapshots s where s.fansub_id = p_fansub_id), 0);
$function$;

create or replace function app_private.tl_daily_page_limit(p_fansub_id uuid)
returns integer language sql stable security definer set search_path = '' as $function$
  select coalesce(
    (select q.daily_page_limit from public.translation_fansub_quotas q where q.fansub_id = p_fansub_id),
    app_private.tl_tier_page_limit(app_private.tl_fansub_tier(p_fansub_id)));
$function$;

-- The studio is open from boost tier 1, or with a manual quota grant.
create or replace function app_private.tl_fansub_unlocked(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.tl_fansub_tier(p_fansub_id) >= 1
    or exists (select 1 from public.translation_fansub_quotas q where q.fansub_id = p_fansub_id and q.daily_page_limit > 0);
$function$;

-- The guard trigger runs as the caller and calls tl_fansub_unlocked; the others are only called
-- from SECURITY DEFINER functions.
revoke all on function app_private.tl_tier_page_limit(integer) from public, anon;
revoke all on function app_private.tl_fansub_tier(uuid) from public, anon;
revoke all on function app_private.tl_fansub_unlocked(uuid) from public, anon;
grant execute on function app_private.tl_fansub_unlocked(uuid) to authenticated, service_role;

-- Studio status for the team: lock state, today's AI usage and what the next tier brings.
create or replace function public.tl_studio_status(p_fansub_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_tier integer := app_private.tl_fansub_tier(p_fansub_id);
  v_snapshot public.fansub_boost_snapshots%rowtype;
begin
  if not app_private.tl_can_fansub(p_fansub_id) then
    raise exception 'Bu ekibin stüdyosunu görme iznin yok.' using errcode = '42501';
  end if;
  select * into v_snapshot from public.fansub_boost_snapshots where fansub_id = p_fansub_id;
  return jsonb_build_object(
    'unlocked', app_private.tl_fansub_unlocked(p_fansub_id) or app_private.is_admin(),
    'unlimited', app_private.is_admin(),
    'tier', v_tier,
    'power', coalesce(v_snapshot.active_power, 0),
    'used', (select count(*) from public.translation_ai_usage u where u.fansub_id = p_fansub_id and u.usage_day = app_private.tl_today()),
    'limit', app_private.tl_daily_page_limit(p_fansub_id),
    'manual_quota', exists (select 1 from public.translation_fansub_quotas q where q.fansub_id = p_fansub_id),
    'next_tier', case when v_tier < 3 then v_tier + 1 end,
    'next_tier_power', case when v_tier < 3 then public.get_fansub_boost_next_tier_required_power(v_tier) end,
    'next_tier_limit', case when v_tier < 3 then app_private.tl_tier_page_limit(v_tier + 1) end,
    'tier_limits', jsonb_build_object(
      '1', app_private.tl_tier_page_limit(1), '2', app_private.tl_tier_page_limit(2), '3', app_private.tl_tier_page_limit(3)),
    'tier_powers', jsonb_build_object(
      '1', public.get_fansub_boost_next_tier_required_power(0),
      '2', public.get_fansub_boost_next_tier_required_power(1),
      '3', public.get_fansub_boost_next_tier_required_power(2)));
end;
$function$;

revoke all on function public.tl_studio_status(uuid) from public, anon;
grant execute on function public.tl_studio_status(uuid) to authenticated;

-- New chapters can only be opened in an unlocked studio. Revisions of published chapters are
-- opened by a service-role definer (tl_open_chapter_revision) and stay possible.
create or replace function app_private.tl_project_guard()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if tg_op = 'INSERT' and not app_private.tl_is_service() and not app_private.is_admin()
    and not app_private.tl_fansub_unlocked(new.fansub_id) then
    raise exception 'Çeviri Stüdyosu takviye seviyesi 1 ile açılır.' using errcode = 'PT403';
  end if;
  if tg_op = 'UPDATE' then
    if new.fansub_id <> old.fansub_id then
      raise exception 'fansub degistirilemez' using errcode = 'PT409';
    end if;
    if new.source_language <> old.source_language
      and exists (select 1 from public.translation_pages where project_id = old.id and scan_stage <> 'none') then
      raise exception 'tarama basladiktan sonra ham dil degismez' using errcode = 'PT409';
    end if;
  end if;
  -- SQL AND kisa devre garanti etmez; bolum kontrolu yalniz baglanti degisince calisir.
  if new.chapter_id is not null and (tg_op = 'INSERT' or new.chapter_id is distinct from old.chapter_id) then
    if not app_private.tl_is_service()
      and not app_private.tl_chapter_matches(new.chapter_id, new.fansub_id, new.manga_id, new.chapter_number) then
      raise exception 'bolum bu projeye ait degil' using errcode = 'PT403';
    end if;
  end if;
  return new;
end;
$function$;

-- The single global limit is replaced by the tier table.
update public.feature_flags
set metadata = (metadata - 'daily_page_limit') || jsonb_build_object('tier_page_limits', jsonb_build_object('1', 30, '2', 60, '3', 120))
where key = 'translation.studio_v3';

-- Admin: per-tier daily limits replace the single default limit.
create or replace function public.admin_set_translation_tier_limits(p_limits jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_tier text;
begin
  if not app_private.is_admin() then
    raise exception 'Yalnızca site yöneticisi limit ayarlayabilir.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_limits) is distinct from 'object' then
    raise exception 'Seviye limitleri geçersiz.' using errcode = '22023';
  end if;
  foreach v_tier in array array['1', '2', '3'] loop
    if jsonb_typeof(p_limits -> v_tier) is distinct from 'number'
      or (p_limits ->> v_tier) !~ '^[0-9]{1,5}$' or (p_limits ->> v_tier)::integer > 10000 then
      raise exception 'Her seviye için 0 ile 10000 arasında tam sayı gir.' using errcode = '22023';
    end if;
  end loop;
  update public.feature_flags
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('tier_page_limits', jsonb_build_object(
    '1', (p_limits ->> '1')::integer, '2', (p_limits ->> '2')::integer, '3', (p_limits ->> '3')::integer))
  where key = 'translation.studio_v3';
end;
$function$;
revoke all on function public.admin_set_translation_tier_limits(jsonb) from public, anon;
grant execute on function public.admin_set_translation_tier_limits(jsonb) to authenticated;

drop function if exists public.admin_set_translation_default_limit(integer);

-- Admin overview: tier limits instead of the single default, tier and lock per team, all active teams listed.
create or replace function public.admin_translation_studio_overview(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
  v_since timestamptz := (app_private.tl_today() - (v_days - 1))::timestamp at time zone 'Europe/Istanbul';
  v_today date := app_private.tl_today();
  v_result jsonb;
begin
  if not app_private.is_admin() then
    raise exception 'Yalnızca site yöneticisi görebilir.' using errcode = '42501';
  end if;

  with jobs as (
    select j.*, p.fansub_id
    from public.translation_jobs j
    join public.translation_projects p on p.id = j.project_id
    where j.created_at >= v_since
  ),
  usage as (
    select u.fansub_id, u.usage_day, count(*) as pages
    from public.translation_ai_usage u
    where u.usage_day >= app_private.tl_today() - (v_days - 1)
    group by u.fansub_id, u.usage_day
  ),
  fansub_ids as (
    select fansub_id from jobs
    union select fansub_id from usage
    union select fansub_id from public.translation_projects
    union select fansub_id from public.translation_fansub_quotas
    -- Every active team is listed, so a manual grant can be given to a team still locked.
    union select id from public.fansubs where is_active
  ),
  fansub_rows as (
    select
      f.id, f.name,
      app_private.tl_daily_page_limit(f.id) as daily_limit,
      exists (select 1 from public.translation_fansub_quotas q where q.fansub_id = f.id) as custom_limit,
      app_private.tl_fansub_tier(f.id) as tier,
      app_private.tl_fansub_unlocked(f.id) as unlocked,
      coalesce((select sum(pages) from usage where usage.fansub_id = f.id and usage.usage_day = v_today), 0) as today_pages,
      coalesce((select sum(pages) from usage where usage.fansub_id = f.id), 0) as period_pages,
      coalesce((select sum(j.cost_usd) from jobs j where j.fansub_id = f.id), 0) as cost_usd,
      (select count(*) from jobs j where j.fansub_id = f.id) as jobs,
      (select count(*) from jobs j where j.fansub_id = f.id and j.status = 'failed') as failed,
      (select count(*) from jobs j where j.fansub_id = f.id and j.error = 'content_blocked') as blocked,
      (select count(*) from public.translation_projects p where p.fansub_id = f.id) as projects,
      (select count(*) from public.translation_projects p where p.fansub_id = f.id and p.chapter_id is not null) as published,
      greatest(
        (select max(j.created_at) from jobs j where j.fansub_id = f.id),
        (select max(p.updated_at) from public.translation_projects p where p.fansub_id = f.id)
      ) as last_activity
    from public.fansubs f
    where f.id in (select fansub_id from fansub_ids where fansub_id is not null)
  )
  select jsonb_build_object(
    'days', v_days,
    'tierLimits', jsonb_build_object('1', app_private.tl_tier_page_limit(1), '2', app_private.tl_tier_page_limit(2), '3', app_private.tl_tier_page_limit(3)),
    'totals', jsonb_build_object(
      'costUsd', coalesce((select sum(cost_usd) from jobs), 0),
      'inputTokens', coalesce((select sum(input_tokens) from jobs), 0),
      'outputTokens', coalesce((select sum(output_tokens) from jobs), 0),
      'jobs', (select count(*) from jobs),
      'failed', (select count(*) from jobs where status = 'failed'),
      'blocked', (select count(*) from jobs where error = 'content_blocked'),
      'pages', coalesce((select sum(pages) from usage), 0),
      'todayPages', coalesce((select sum(pages) from usage where usage_day = v_today), 0),
      'activeFansubs', (select count(distinct fansub_id) from usage),
      'projects', (select count(*) from public.translation_projects),
      'published', (select count(*) from public.translation_projects where chapter_id is not null),
      'pendingDrafts', (select count(*) from public.translation_series_drafts where status = 'pending')
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'pages', d.pages, 'costUsd', d.cost) order by d.day)
      from (
        select days.day,
          coalesce((select sum(pages) from usage where usage.usage_day = days.day), 0) as pages,
          coalesce((select sum(j.cost_usd) from jobs j where (j.created_at at time zone 'Europe/Istanbul')::date = days.day), 0) as cost
        from (select g::date as day from generate_series((app_private.tl_today() - (v_days - 1))::timestamp, app_private.tl_today()::timestamp, interval '1 day') g) as days
      ) d
    ), '[]'::jsonb),
    'stages', coalesce((select jsonb_object_agg(stage, n) from (select stage, count(*) n from public.translation_projects group by stage) s), '{}'::jsonb),
    'errors', coalesce((select jsonb_object_agg(error, n) from (select error, count(*) n from jobs where status = 'failed' and error is not null group by error) e), '{}'::jsonb),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('task', task, 'provider', provider, 'model', model, 'jobs', n, 'costUsd', cost) order by cost desc)
      from (select task, provider, model, count(*) n, coalesce(sum(cost_usd), 0) cost from jobs where provider is not null group by task, provider, model) m
    ), '[]'::jsonb),
    'fansubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'dailyLimit', daily_limit, 'customLimit', custom_limit, 'tier', tier, 'unlocked', unlocked, 'todayPages', today_pages,
        'periodPages', period_pages, 'costUsd', cost_usd, 'jobs', jobs, 'failed', failed, 'blocked', blocked,
        'projects', projects, 'published', published, 'lastActivity', last_activity
      ) order by period_pages desc, cost_usd desc, name)
      from fansub_rows
    ), '[]'::jsonb),
    -- Content check: content block on a non +18 series (all time), projects with no decision or
    -- with a new block after the decision.
    'flags', coalesce((
      select jsonb_agg(jsonb_build_object(
        'projectId', x.project_id, 'fansubId', x.fansub_id, 'fansubName', x.fansub_name, 'title', x.title,
        'chapter', x.chapter_number, 'blocked', x.blocked, 'pages', x.pages, 'lastAt', x.last_at
      ) order by x.last_at desc)
      from (
        select p.id as project_id, p.fansub_id, f.name as fansub_name, coalesce(m.title, d.title, 'Seri') as title,
          p.chapter_number, count(*) as blocked, count(distinct j.page_id) as pages, max(j.created_at) as last_at
        from public.translation_jobs j
        join public.translation_projects p on p.id = j.project_id
        left join public.fansubs f on f.id = p.fansub_id
        left join public.mangas m on m.id = p.manga_id
        left join public.translation_series_drafts d on d.id = p.series_draft_id
        left join public.translation_content_reviews r on r.project_id = p.id
        where j.error = 'content_blocked'
          and not app_private.tl_project_is_mature(p.id)
        group by p.id, f.name, m.title, d.title, r.blocked_count
        having r.blocked_count is null or count(*) > r.blocked_count
      ) x
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_translation_studio_overview(integer) from public, anon;
grant execute on function public.admin_translation_studio_overview(integer) to authenticated;
