-- Translation Studio admin panel: usage, cost, limit and content check.
-- admin_translation_studio_overview(p_days) fills the panel in one call (site admin only).
-- Content check: projects with an AI content block (content_blocked) on a series not marked +18
-- are listed; the admin says "mark +18" or "no issue" (the decision is stored).

create table if not exists public.translation_content_reviews (
  project_id uuid primary key references public.translation_projects(id) on delete cascade,
  decision text not null check (decision in ('mature', 'ok')),
  blocked_count integer not null default 0,
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz not null default now()
);
alter table public.translation_content_reviews enable row level security;
create policy translation_content_reviews_admin_select on public.translation_content_reviews for select to authenticated
  using (app_private.is_admin());

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
  ),
  fansub_rows as (
    select
      f.id, f.name,
      app_private.tl_daily_page_limit(f.id) as daily_limit,
      exists (select 1 from public.translation_fansub_quotas q where q.fansub_id = f.id) as custom_limit,
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
    'defaultLimit', coalesce((select (ff.metadata->>'daily_page_limit')::integer from public.feature_flags ff where ff.key = 'translation.studio_v3'), 60),
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
        'id', id, 'name', name, 'dailyLimit', daily_limit, 'customLimit', custom_limit, 'todayPages', today_pages,
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
revoke all on function public.admin_translation_studio_overview(integer) from public;
grant execute on function public.admin_translation_studio_overview(integer) to authenticated;

-- Varsayilan gunluk limit (bayrak metadata).
create or replace function public.admin_set_translation_default_limit(p_limit integer)
returns void language plpgsql volatile security definer set search_path = '' as $function$
begin
  if not app_private.is_admin() then
    raise exception 'Yalnızca site yöneticisi limit ayarlayabilir.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 0 or p_limit > 10000 then
    raise exception 'Limit 0 ile 10000 arasında olmalı.' using errcode = '22023';
  end if;
  update public.feature_flags set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('daily_page_limit', p_limit)
  where key = 'translation.studio_v3';
end;
$function$;
revoke all on function public.admin_set_translation_default_limit(integer) from public;
grant execute on function public.admin_set_translation_default_limit(integer) to authenticated;

-- Content check decision: 'mature' makes the series (or draft) +18 -> AI closes;
-- 'ok' records the current block count (the list shows again on a new block).
create or replace function public.admin_review_translation_content(p_project_id uuid, p_decision text)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_project public.translation_projects%rowtype;
  v_blocked integer;
begin
  if not app_private.is_admin() then
    raise exception 'Yalnızca site yöneticisi karar verebilir.' using errcode = '42501';
  end if;
  if p_decision not in ('mature', 'ok') then
    raise exception 'Geçersiz karar.' using errcode = '22023';
  end if;
  select * into v_project from public.translation_projects where id = p_project_id;
  if not found then
    raise exception 'Proje bulunamadı.' using errcode = 'P0002';
  end if;
  select count(*) into v_blocked from public.translation_jobs where project_id = p_project_id and error = 'content_blocked';
  if p_decision = 'mature' then
    if v_project.manga_id is not null then
      update public.mangas set is_mature = true where id = v_project.manga_id;
    elsif v_project.series_draft_id is not null then
      update public.translation_series_drafts set is_mature = true where id = v_project.series_draft_id;
    end if;
  end if;
  insert into public.translation_content_reviews (project_id, decision, blocked_count, decided_by)
  values (p_project_id, p_decision, v_blocked, app_private.current_public_user_id())
  on conflict (project_id) do update set decision = excluded.decision, blocked_count = excluded.blocked_count,
    decided_by = excluded.decided_by, decided_at = now();
end;
$function$;
revoke all on function public.admin_review_translation_content(uuid, text) from public;
grant execute on function public.admin_review_translation_content(uuid, text) to authenticated;
