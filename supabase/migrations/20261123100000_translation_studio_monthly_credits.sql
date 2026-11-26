-- Translation Studio: AI allowance moves from daily pages to a monthly credit pool.
--
-- 1 credit = USD 0.002 of real API cost (metadata.credit_usd). Each AI job (scan, re-read,
-- translation) uses credits equal to its recorded cost, so a cheaper model stretches the same
-- credits further and a long webtoon page costs more than a short manga page. Reader translations
-- (task translate_reader) are not charged to the team.
--
-- Monthly credits by fansub boost tier (metadata.tier_monthly_credits, editable by admins):
--   tier 0: studio locked
--   tier 1: 1000 credits (about USD 2 a month; a 60-page webtoon chapter is about 70 credits)
--   tier 2: 2500 credits
--   tier 3: 6000 credits
-- The month runs on Turkey time and resets on the 1st. A manual monthly_credit_limit on
-- translation_fansub_quotas overrides the tier and (when > 0) unlocks the studio. Site admins are
-- never limited. A job already running finishes even if it crosses the limit (cost is known only
-- afterwards); the next one is refused.

alter table public.translation_fansub_quotas
  add column if not exists monthly_credit_limit integer check (monthly_credit_limit is null or monthly_credit_limit between 0 and 1000000);
alter table public.translation_fansub_quotas alter column daily_page_limit drop not null;

create or replace function app_private.tl_credit_usd()
returns numeric language sql stable security definer set search_path = '' as $function$
  select coalesce(
    (select case when v.value ~ '^0?\.[0-9]{1,6}$' and v.value::numeric > 0 then v.value::numeric end
       from public.feature_flags f
       cross join lateral (select f.metadata ->> 'credit_usd' as value) v
       where f.key = 'translation.studio_v3'),
    0.002);
$function$;

create or replace function app_private.tl_tier_credits(p_tier integer)
returns integer language sql stable security definer set search_path = '' as $function$
  -- A hand-edited value that is not a whole number falls back to the default.
  select case when coalesce(p_tier, 0) <= 0 then 0 else coalesce(
    (select case when v.value ~ '^[0-9]{1,7}$' then v.value::integer end
       from public.feature_flags f
       cross join lateral (select f.metadata -> 'tier_monthly_credits' ->> least(p_tier, 3)::text as value) v
       where f.key = 'translation.studio_v3'),
    case least(p_tier, 3) when 1 then 1000 when 2 then 2500 else 6000 end) end;
$function$;

create or replace function app_private.tl_month_start()
returns timestamptz language sql stable set search_path = '' as $function$
  select pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
$function$;

create or replace function app_private.tl_monthly_credit_limit(p_fansub_id uuid)
returns integer language sql stable security definer set search_path = '' as $function$
  select coalesce(
    (select q.monthly_credit_limit from public.translation_fansub_quotas q where q.fansub_id = p_fansub_id),
    app_private.tl_tier_credits(app_private.tl_fansub_tier(p_fansub_id)));
$function$;

create or replace function app_private.tl_month_credits_used(p_fansub_id uuid)
returns integer language sql stable security definer set search_path = '' as $function$
  select pg_catalog.ceil(coalesce(sum(j.cost_usd), 0) / app_private.tl_credit_usd())::integer
  from public.translation_jobs j
  join public.translation_projects p on p.id = j.project_id
  where p.fansub_id = p_fansub_id
    and j.created_at >= app_private.tl_month_start()
    and j.task <> 'translate_reader';
$function$;

create or replace function app_private.tl_fansub_unlocked(p_fansub_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select app_private.tl_fansub_tier(p_fansub_id) >= 1
    or exists (select 1 from public.translation_fansub_quotas q where q.fansub_id = p_fansub_id and q.monthly_credit_limit > 0);
$function$;

revoke all on function app_private.tl_credit_usd() from public, anon;
revoke all on function app_private.tl_tier_credits(integer) from public, anon;
revoke all on function app_private.tl_month_start() from public, anon;
revoke all on function app_private.tl_monthly_credit_limit(uuid) from public, anon;
revoke all on function app_private.tl_month_credits_used(uuid) from public, anon;
revoke all on function app_private.tl_fansub_unlocked(uuid) from public, anon;
grant execute on function app_private.tl_fansub_unlocked(uuid) to authenticated, service_role;

-- Every AI job asks first: refused once the month's credits are used up. The page is still
-- recorded in translation_ai_usage for usage statistics.
create or replace function public.tl_claim_ai_page(p_page_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_fansub uuid := app_private.tl_page_fansub(p_page_id);
  v_limit integer;
  v_used integer;
begin
  if v_fansub is null or not app_private.tl_can_fansub(v_fansub) then
    raise exception 'Bu sayfaya erişimin yok.' using errcode = '42501';
  end if;
  v_limit := app_private.tl_monthly_credit_limit(v_fansub);
  v_used := app_private.tl_month_credits_used(v_fansub);
  if v_used >= v_limit and not app_private.is_admin() then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit, 'unit', 'credit');
  end if;
  insert into public.translation_ai_usage (fansub_id, usage_day, page_id) values (v_fansub, app_private.tl_today(), p_page_id)
    on conflict do nothing;
  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'unit', 'credit');
end;
$function$;
revoke all on function public.tl_claim_ai_page(uuid) from public, anon;
grant execute on function public.tl_claim_ai_page(uuid) to authenticated;

-- Kept for the scan step: this month's credits (field names unchanged).
create or replace function public.tl_ai_usage_today(p_fansub_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not app_private.tl_can_fansub(p_fansub_id) then
    raise exception 'Bu ekibin stüdyosunu görme iznin yok.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'used', app_private.tl_month_credits_used(p_fansub_id),
    'limit', app_private.tl_monthly_credit_limit(p_fansub_id),
    'unlimited', app_private.is_admin());
end;
$function$;

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
    'used', app_private.tl_month_credits_used(p_fansub_id),
    'limit', app_private.tl_monthly_credit_limit(p_fansub_id),
    'resets_at', app_private.tl_month_start() + interval '1 month',
    'credit_usd', app_private.tl_credit_usd(),
    'manual_quota', exists (select 1 from public.translation_fansub_quotas q where q.fansub_id = p_fansub_id and q.monthly_credit_limit is not null),
    'next_tier', case when v_tier < 3 then v_tier + 1 end,
    'next_tier_power', case when v_tier < 3 then public.get_fansub_boost_next_tier_required_power(v_tier) end,
    'next_tier_limit', case when v_tier < 3 then app_private.tl_tier_credits(v_tier + 1) end,
    'tier_limits', jsonb_build_object('1', app_private.tl_tier_credits(1), '2', app_private.tl_tier_credits(2), '3', app_private.tl_tier_credits(3)),
    'tier_powers', jsonb_build_object(
      '1', public.get_fansub_boost_next_tier_required_power(0),
      '2', public.get_fansub_boost_next_tier_required_power(1),
      '3', public.get_fansub_boost_next_tier_required_power(2)));
end;
$function$;
revoke all on function public.tl_studio_status(uuid) from public, anon;
grant execute on function public.tl_studio_status(uuid) to authenticated;

-- Admin: monthly credits per tier.
create or replace function public.admin_set_translation_tier_limits(p_limits jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_tier text;
begin
  if not app_private.is_admin() then
    raise exception 'Yalnızca site yöneticisi limit ayarlayabilir.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_limits) is distinct from 'object' then
    raise exception 'Seviye kredileri geçersiz.' using errcode = '22023';
  end if;
  foreach v_tier in array array['1', '2', '3'] loop
    if jsonb_typeof(p_limits -> v_tier) is distinct from 'number'
      or (p_limits ->> v_tier) !~ '^[0-9]{1,7}$' or (p_limits ->> v_tier)::integer > 1000000 then
      raise exception 'Her seviye için 0 ile 1.000.000 arasında tam sayı gir.' using errcode = '22023';
    end if;
  end loop;
  update public.feature_flags
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('tier_monthly_credits', jsonb_build_object(
    '1', (p_limits ->> '1')::integer, '2', (p_limits ->> '2')::integer, '3', (p_limits ->> '3')::integer))
  where key = 'translation.studio_v3';
end;
$function$;
revoke all on function public.admin_set_translation_tier_limits(jsonb) from public, anon;
grant execute on function public.admin_set_translation_tier_limits(jsonb) to authenticated;

-- Admin: a team's own monthly credit limit (null = back to the tier, 0 = AI off).
create or replace function public.tl_set_fansub_credit_limit(p_fansub_id uuid, p_limit integer)
returns void language plpgsql volatile security definer set search_path = '' as $function$
begin
  if not app_private.is_admin() then
    raise exception 'Yalnızca site yöneticisi limit ayarlayabilir.' using errcode = '42501';
  end if;
  if p_limit is not null and (p_limit < 0 or p_limit > 1000000) then
    raise exception 'Limit 0 ile 1.000.000 arasında olmalı.' using errcode = '22023';
  end if;
  if p_limit is null then
    delete from public.translation_fansub_quotas where fansub_id = p_fansub_id;
  else
    insert into public.translation_fansub_quotas (fansub_id, monthly_credit_limit) values (p_fansub_id, p_limit)
      on conflict (fansub_id) do update set monthly_credit_limit = excluded.monthly_credit_limit, updated_at = now();
  end if;
end;
$function$;
revoke all on function public.tl_set_fansub_credit_limit(uuid, integer) from public, anon;
grant execute on function public.tl_set_fansub_credit_limit(uuid, integer) to authenticated;

-- Admin overview: monthly credits per team and per tier.
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
    union select fansub_id from public.translation_fansub_quotas where monthly_credit_limit is not null
    -- Every active team is listed, so a manual grant can be given to a team still locked.
    union select id from public.fansubs where is_active
  ),
  fansub_rows as (
    select
      f.id, f.name,
      app_private.tl_monthly_credit_limit(f.id) as monthly_limit,
      app_private.tl_month_credits_used(f.id) as month_credits,
      exists (select 1 from public.translation_fansub_quotas q where q.fansub_id = f.id and q.monthly_credit_limit is not null) as custom_limit,
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
    'tierCredits', jsonb_build_object('1', app_private.tl_tier_credits(1), '2', app_private.tl_tier_credits(2), '3', app_private.tl_tier_credits(3)),
    'creditUsd', app_private.tl_credit_usd(),
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
        'id', id, 'name', name, 'monthlyLimit', monthly_limit, 'monthCredits', month_credits, 'customLimit', custom_limit, 'tier', tier, 'unlocked', unlocked, 'todayPages', today_pages,
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

-- Page-based limits are gone.
drop function if exists public.tl_set_fansub_daily_limit(uuid, integer);
drop function if exists app_private.tl_daily_page_limit(uuid);
drop function if exists app_private.tl_tier_page_limit(integer);

update public.feature_flags
set metadata = (metadata - 'tier_page_limits' - 'daily_page_limit')
  || jsonb_build_object('tier_monthly_credits', jsonb_build_object('1', 1000, '2', 2500, '3', 6000), 'credit_usd', '0.002')
where key = 'translation.studio_v3';
