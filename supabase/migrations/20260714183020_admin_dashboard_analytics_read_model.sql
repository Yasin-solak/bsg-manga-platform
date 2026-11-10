-- Feeds the admin dashboard through a single, authorized, period-aware read model.
-- The operations score is not platform telemetry but the average of existing quality rates.
begin;
create schema if not exists app_private;
grant usage on schema app_private to authenticated, service_role;
create or replace function app_private.get_admin_dashboard_snapshot(
  p_period text,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_period text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_period, '')));
  v_timezone constant text := 'Europe/Istanbul';
  v_local_as_of timestamp without time zone;
  v_current_start_local timestamp without time zone;
  v_current_end_local timestamp without time zone;
  v_previous_start_local timestamp without time zone;
  v_previous_end_local timestamp without time zone;
  v_current_start timestamptz;
  v_current_end timestamptz;
  v_previous_start timestamptz;
  v_previous_end timestamptz;
  v_day_count integer;
  v_reports_enabled boolean;
  v_metrics jsonb; v_queues jsonb; v_quality jsonb;
  v_operation_health jsonb;
  v_series jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using
      errcode = '42501',
      message = 'Bu dashboard ozeti icin admin yetkisi gerekir.';
  end if;
  if p_as_of is null then
    raise exception using
      errcode = '22023',
      message = 'Dashboard referans zamani bos olamaz.';
  end if;
  if v_period not in ('7d', '30d', 'month') then
    raise exception using
      errcode = '22023',
      message = 'Dashboard donemi 7d, 30d veya month olmalidir.';
  end if;
  v_local_as_of := p_as_of at time zone v_timezone;
  v_current_end_local := v_local_as_of;
  case v_period
    when '7d' then
      v_current_start_local := pg_catalog.date_trunc('day', v_local_as_of) - interval '6 days';
      v_previous_start_local := v_current_start_local - interval '7 days';
      v_previous_end_local := v_current_end_local - interval '7 days';
    when '30d' then
      v_current_start_local := pg_catalog.date_trunc('day', v_local_as_of) - interval '29 days';
      v_previous_start_local := v_current_start_local - interval '30 days';
      v_previous_end_local := v_current_end_local - interval '30 days';
    when 'month' then
      v_current_start_local := pg_catalog.date_trunc('month', v_local_as_of);
      v_previous_start_local := v_current_start_local - interval '1 month';
      v_previous_end_local := least(
        v_current_start_local,
        v_previous_start_local + (v_current_end_local - v_current_start_local)
      );
  end case;
  v_current_start := v_current_start_local at time zone v_timezone;
  v_current_end := v_current_end_local at time zone v_timezone;
  v_previous_start := v_previous_start_local at time zone v_timezone;
  v_previous_end := v_previous_end_local at time zone v_timezone;
  v_day_count := (v_current_end_local::date - v_current_start_local::date) + 1;
  v_reports_enabled := app_private.is_feature_enabled('moderation.reports', false);
  with
  latest_pending_revision as materialized (
    select distinct on (r.target_type, r.target_id)
      r.target_type,
      r.target_id,
      r.created_at
    from public.pending_content_revisions r
    where r.status = 'pending'
      and r.target_type in ('manga', 'chapter')
    order by r.target_type, r.target_id, r.created_at desc
  ),
  open_items as materialized (
    select
      'approval'::text as queue_key,
      'manga:' || m.id::text as work_key,
      coalesce(r.created_at, m.created_at) as queued_at
    from public.mangas m
    left join latest_pending_revision r
      on r.target_type = 'manga' and r.target_id = m.id
    where m.is_approved = false
    union all
    select
      'approval',
      'chapter:' || c.id::text,
      coalesce(r.created_at, c.created_at)
    from public.chapters c
    left join latest_pending_revision r
      on r.target_type = 'chapter' and r.target_id = c.id
    where c.is_approved = false
    union all
    select 'approval', 'fansub_request:' || f.id::text, f.created_at
    from public.fansub_requests f
    where f.status = 'pending' and f.is_active = true
    union all
    select 'community', 'community_post:' || p.id::text, p.created_at
    from public.community_posts p
    where p.status = 'pending'
    union all
    select 'reports', 'report:' || r.id::text, r.created_at
    from public.reports r
    where v_reports_enabled and r.status = 'pending'
    union all
    select 'legal', 'legal_request:' || l.id::text, l.created_at
    from public.legal_requests l
    where l.status in ('new', 'needs_info', 'under_review')
  ),
  content_revision_arrivals as materialized (
    select distinct on (
      r.target_type, r.target_id,
      case when r.created_at >= v_current_start then 'current' else 'previous' end
    )
      'approval'::text as queue_key,
      r.target_type || ':' || r.target_id::text as arrival_key,
      r.target_type || ':' || r.target_id::text as work_key,
      r.created_at as queued_at,
      r.status,
      r.status in ('approved', 'rejected') as is_terminal,
      r.status as outcome,
      r.reviewed_at as terminal_at
    from public.pending_content_revisions r
    where r.target_type in ('manga', 'chapter') and (
      (r.created_at >= v_previous_start and r.created_at < v_previous_end)
      or (r.created_at >= v_current_start and r.created_at < v_current_end)
    )
    order by r.target_type, r.target_id, case
      when r.created_at >= v_current_start then 'current' else 'previous' end,
      r.created_at desc, r.id desc
  ),
  content_fallback_arrivals as materialized (
    select
      'approval'::text as queue_key,
      'manga:' || m.id::text as arrival_key,
      'manga:' || m.id::text as work_key,
      m.created_at as queued_at,
      case when m.is_approved then 'approved' else 'pending' end as status,
      m.is_approved as is_terminal,
      case when m.is_approved then 'approved' else 'pending' end as outcome,
      case when m.is_approved then m.updated_at else null end as terminal_at
    from public.mangas m
    where m.created_at >= v_previous_start
      and m.created_at < v_current_end
      and not exists (
        select 1
        from public.pending_content_revisions r
        where r.target_type = 'manga' and r.target_id = m.id
      )
    union all
    select
      'approval',
      'chapter:' || c.id::text,
      'chapter:' || c.id::text,
      c.created_at,
      case when c.is_approved then 'approved' else 'pending' end,
      c.is_approved,
      case when c.is_approved then 'approved' else 'pending' end,
      case when c.is_approved then c.updated_at else null end
    from public.chapters c
    where c.created_at >= v_previous_start
      and c.created_at < v_current_end
      and not exists (
        select 1
        from public.pending_content_revisions r
        where r.target_type = 'chapter' and r.target_id = c.id
      )
  ),
  arrivals as materialized (
    select * from content_revision_arrivals
    union all
    select * from content_fallback_arrivals
    union all
    select
      'approval',
      'fansub_request:' || f.id::text,
      'fansub_request:' || f.id::text,
      f.created_at,
      f.status,
      f.status in ('approved', 'rejected'),
      f.status,
      f.reviewed_at
    from public.fansub_requests f
    where f.created_at >= v_previous_start
      and f.created_at < v_current_end
    union all
    select
      'community',
      'community_post:' || p.id::text,
      'community_post:' || p.id::text,
      p.created_at,
      p.status,
      p.status in ('approved', 'rejected'),
      p.status,
      case p.status when 'approved' then p.approved_at when 'rejected' then p.rejected_at end
    from public.community_posts p
    where p.created_at >= v_previous_start
      and p.created_at < v_current_end
    union all
    select
      'reports',
      'report:' || r.id::text,
      'report:' || r.id::text,
      r.created_at,
      r.status,
      r.status in ('resolved', 'dismissed'),
      r.status,
      r.resolved_at
    from public.reports r
    where v_reports_enabled
      and r.created_at >= v_previous_start
      and r.created_at < v_current_end
    union all
    select
      'legal',
      'legal_request:' || l.id::text,
      'legal_request:' || l.id::text,
      l.created_at,
      l.status,
      l.status in ('actioned', 'rejected'),
      l.status,
      l.reviewed_at
    from public.legal_requests l
    where l.created_at >= v_previous_start
      and l.created_at < v_current_end
  ),
  inventory_counts as materialized (
    select
      'users'::text as metric_key,
      'Kullanicilar'::text as label,
      pg_catalog.count(*)::numeric as total,
      pg_catalog.count(*) filter (
        where u.created_at >= v_current_start and u.created_at < v_current_end
      )::numeric as current_period,
      pg_catalog.count(*) filter (
        where u.created_at >= v_previous_start and u.created_at < v_previous_end
      )::numeric as previous_period,
      1 as sort_order
    from public.users u
    union all
    select
      'mangas', 'Manga', pg_catalog.count(*)::numeric,
      pg_catalog.count(*) filter (
        where m.created_at >= v_current_start and m.created_at < v_current_end
      )::numeric,
      pg_catalog.count(*) filter (
        where m.created_at >= v_previous_start and m.created_at < v_previous_end
      )::numeric,
      2
    from public.mangas m
    union all
    select
      'community', 'Topluluk', pg_catalog.count(*)::numeric,
      pg_catalog.count(*) filter (
        where p.created_at >= v_current_start and p.created_at < v_current_end
      )::numeric,
      pg_catalog.count(*) filter (
        where p.created_at >= v_previous_start and p.created_at < v_previous_end
      )::numeric,
      3
    from public.community_posts p
    union all
    select
      'fansubs', 'Fansub', pg_catalog.count(*)::numeric,
      pg_catalog.count(*) filter (
        where f.created_at >= v_current_start and f.created_at < v_current_end
      )::numeric,
      pg_catalog.count(*) filter (
        where f.created_at >= v_previous_start and f.created_at < v_previous_end
      )::numeric,
      4
    from public.fansubs f
  ),
  queue_catalog as (
    select *
    from (values
      ('approval'::text, 'Onay kuyrugu'::text, 1),
      ('community'::text, 'Topluluk moderasyonu'::text, 2),
      ('reports'::text, 'Rapor kuyrugu'::text, 3),
      ('legal'::text, 'Yasal talepler'::text, 4)
    ) as q(queue_key, label, sort_order)
  ),
  open_queue_counts as materialized (
    select
      o.queue_key,
      pg_catalog.count(distinct o.work_key)::numeric as current_total,
      pg_catalog.min(o.queued_at) as oldest_queued_at
    from open_items o
    group by o.queue_key
  ),
  arrival_queue_counts as materialized (
    select
      a.queue_key,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queued_at >= v_current_start and a.queued_at < v_current_end
      )::numeric as current_arrivals,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queued_at >= v_previous_start and a.queued_at < v_previous_end
      )::numeric as previous_arrivals
    from arrivals a
    group by a.queue_key
  ),
  queue_rows as materialized (
    select
      q.queue_key,
      q.label,
      case
        when q.queue_key = 'reports' and not v_reports_enabled then 'disabled'
        else 'available'
      end as status,
      case
        when q.queue_key = 'reports' and not v_reports_enabled then null::numeric
        else coalesce(o.current_total, 0)::numeric
      end as current_total,
      case
        when q.queue_key = 'reports' and not v_reports_enabled then null::numeric
        else coalesce(a.current_arrivals, 0)::numeric
      end as current_arrivals,
      case
        when q.queue_key = 'reports' and not v_reports_enabled then null::numeric
        else coalesce(a.previous_arrivals, 0)::numeric
      end as previous_arrivals,
      case
        when q.queue_key = 'reports' and not v_reports_enabled then null::timestamptz
        else o.oldest_queued_at
      end as oldest_queued_at,
      q.sort_order
    from queue_catalog q
    left join open_queue_counts o on o.queue_key = q.queue_key
    left join arrival_queue_counts a on a.queue_key = q.queue_key
  ),
  quality_rows as materialized (
    select
      'moderation_completion'::text as quality_key,
      'Moderasyon tamamlama'::text as label,
      'available'::text as status,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queued_at >= v_current_start
          and a.queued_at < v_current_end
          and a.is_terminal
          and a.terminal_at < v_current_end
      )::numeric as numerator,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queued_at >= v_current_start and a.queued_at < v_current_end
      )::numeric as denominator,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queued_at >= v_previous_start
          and a.queued_at < v_previous_end
          and a.is_terminal
          and a.terminal_at < v_previous_end
      )::numeric as previous_numerator,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queued_at >= v_previous_start and a.queued_at < v_previous_end
      )::numeric as previous_denominator,
      'Su an terminal olan benzersiz islerin kendi donem sonundan once tamamlanan kohort payidir; tarihsel snapshot degildir.'::text as disclosure,
      1 as sort_order
    from arrivals a
    union all
    select
      'community_approval', 'Topluluk onay orani', 'available',
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'community'
          and a.queued_at >= v_current_start
          and a.queued_at < v_current_end
          and a.outcome = 'approved'
          and a.terminal_at < v_current_end
      )::numeric,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'community'
          and a.queued_at >= v_current_start
          and a.queued_at < v_current_end
          and a.outcome in ('approved', 'rejected')
          and a.terminal_at < v_current_end
      )::numeric,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'community'
          and a.queued_at >= v_previous_start
          and a.queued_at < v_previous_end
          and a.outcome = 'approved'
          and a.terminal_at < v_previous_end
      )::numeric,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'community'
          and a.queued_at >= v_previous_start
          and a.queued_at < v_previous_end
          and a.outcome in ('approved', 'rejected')
          and a.terminal_at < v_previous_end
      )::numeric,
      'Su an karara bagli ve donem sonundan once sonuclanmis benzersiz topluluk iceriklerindeki onay payidir; yeniden kuyruga alinanlar bugunku durumuyla okunur.',
      2
    from arrivals a
    union all
    select
      'report_closure', 'Rapor cozum orani',
      case when v_reports_enabled then 'available' else 'disabled' end,
      case when v_reports_enabled then pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'reports'
          and a.queued_at >= v_current_start
          and a.queued_at < v_current_end
          and a.outcome = 'resolved'
          and a.terminal_at < v_current_end
      )::numeric else null::numeric end,
      case when v_reports_enabled then pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'reports'
          and a.queued_at >= v_current_start
          and a.queued_at < v_current_end
      )::numeric else null::numeric end,
      case when v_reports_enabled then pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'reports'
          and a.queued_at >= v_previous_start
          and a.queued_at < v_previous_end
          and a.outcome = 'resolved'
          and a.terminal_at < v_previous_end
      )::numeric else null::numeric end,
      case when v_reports_enabled then pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'reports'
          and a.queued_at >= v_previous_start
          and a.queued_at < v_previous_end
      )::numeric else null::numeric end,
      'Canli moderation.reports bayragi aciksa su an cozulmus ve donem sonundan once kapanmis rapor kohortunun oranidir; tarihsel snapshot degildir.',
      3
    from arrivals a
    union all
    select
      'legal_closure', 'Yasal talep kapanma orani', 'available',
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'legal'
          and a.queued_at >= v_current_start
          and a.queued_at < v_current_end
          and a.is_terminal
          and a.terminal_at < v_current_end
      )::numeric,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'legal'
          and a.queued_at >= v_current_start and a.queued_at < v_current_end
      )::numeric,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'legal'
          and a.queued_at >= v_previous_start
          and a.queued_at < v_previous_end
          and a.is_terminal
          and a.terminal_at < v_previous_end
      )::numeric,
      pg_catalog.count(distinct a.arrival_key) filter (
        where a.queue_key = 'legal'
          and a.queued_at >= v_previous_start and a.queued_at < v_previous_end
      )::numeric,
      'Su an actioned veya rejected olan ve donem sonundan once incelenmis benzersiz yasal talep payidir; tarihsel snapshot degildir.',
      4
    from arrivals a
  ),
  quality_rates as materialized (
    select
      q.*,
      case
        when q.denominator > 0
          then pg_catalog.round((q.numerator * 100.0) / q.denominator, 2)
        else null::numeric
      end as rate,
      case
        when q.previous_denominator > 0
          then pg_catalog.round((q.previous_numerator * 100.0) / q.previous_denominator, 2)
        else null::numeric
      end as previous_rate
    from quality_rows q
  ),
  health_scores as materialized (
    select
      pg_catalog.round(pg_catalog.avg(q.rate), 2) as score,
      pg_catalog.round(pg_catalog.avg(q.previous_rate), 2) as previous_score,
      pg_catalog.count(q.rate)::integer as available_metric_count,
      pg_catalog.count(*) filter (where q.status = 'available')::integer as total_metric_count
    from quality_rates q
    where q.status <> 'disabled'
  ),
  backlog_counts as materialized (
    select
      (select pg_catalog.count(distinct o.work_key)::numeric from open_items o)
        as current_total,
      (select pg_catalog.count(distinct a.arrival_key)::numeric
       from arrivals a
       where a.queued_at >= v_current_start and a.queued_at < v_current_end)
        as current_arrivals,
      (select pg_catalog.count(distinct a.arrival_key)::numeric
       from arrivals a
       where a.queued_at >= v_previous_start and a.queued_at < v_previous_end)
        as previous_arrivals
  ),
  metric_rows as materialized (
    select
      i.metric_key,
      i.label,
      i.total,
      i.current_period,
      i.previous_period,
      (i.current_period - i.previous_period) as delta,
      case
        when i.previous_period > 0 then pg_catalog.round(
          ((i.current_period - i.previous_period) * 100.0) / i.previous_period,
          2
        )
        else null::numeric
      end as delta_percent,
      'count'::text as unit,
      'neutral'::text as trend_polarity,
      'created'::text as comparison_basis,
      i.sort_order
    from inventory_counts i
    union all
    select
      'backlog', 'Bekleyen isler', b.current_total,
      b.current_arrivals, b.previous_arrivals,
      b.current_arrivals - b.previous_arrivals,
      case
        when b.previous_arrivals > 0 then pg_catalog.round(
          ((b.current_arrivals - b.previous_arrivals) * 100.0) / b.previous_arrivals,
          2
        )
        else null::numeric
      end,
      'count', 'lower_is_better', 'arrivals', 5
    from backlog_counts b
    union all
    select
      'operations', 'Operasyon kalitesi', h.score,
      h.score, h.previous_score,
      case
        when h.score is not null and h.previous_score is not null
          then pg_catalog.round(h.score - h.previous_score, 2)
        else null::numeric
      end,
      null::numeric,
      'percent', 'higher_is_better', 'quality_average', 6
    from health_scores h
  ),
  inventory_events as materialized (
    select 'users'::text as metric_key, u.created_at as event_at
    from public.users u
    where u.created_at >= v_current_start and u.created_at < v_current_end
    union all
    select 'mangas', m.created_at from public.mangas m
    where m.created_at >= v_current_start and m.created_at < v_current_end
    union all
    select 'community', p.created_at from public.community_posts p
    where p.created_at >= v_current_start and p.created_at < v_current_end
    union all
    select 'fansubs', f.created_at from public.fansubs f
    where f.created_at >= v_current_start and f.created_at < v_current_end
  ),
  inventory_series as materialized (
    select
      (e.event_at at time zone v_timezone)::date as day,
      pg_catalog.count(*) filter (where e.metric_key = 'users')::numeric as users,
      pg_catalog.count(*) filter (where e.metric_key = 'mangas')::numeric as mangas,
      pg_catalog.count(*) filter (where e.metric_key = 'community')::numeric as community,
      pg_catalog.count(*) filter (where e.metric_key = 'fansubs')::numeric as fansubs
    from inventory_events e
    group by (e.event_at at time zone v_timezone)::date
  ),
  arrival_series as materialized (
    select
      (a.queued_at at time zone v_timezone)::date as day,
      pg_catalog.count(distinct a.arrival_key)::numeric as backlog_arrivals,
      pg_catalog.count(distinct a.work_key) filter (where o.work_key is not null)::numeric
        as backlog_open_from_arrivals
    from arrivals a
    left join open_items o on o.work_key = a.work_key
    where a.queued_at >= v_current_start and a.queued_at < v_current_end
    group by (a.queued_at at time zone v_timezone)::date
  ),
  days as (
    select d::date as day
    from pg_catalog.generate_series(
      v_current_start_local::date::timestamp,
      v_current_end_local::date::timestamp,
      interval '1 day'
    ) as d
  ),
  series_rows as materialized (
    select
      d.day,
      coalesce(i.users, 0)::numeric as users,
      coalesce(i.mangas, 0)::numeric as mangas,
      coalesce(i.community, 0)::numeric as community,
      coalesce(i.fansubs, 0)::numeric as fansubs,
      coalesce(a.backlog_arrivals, 0)::numeric as backlog_arrivals,
      coalesce(a.backlog_open_from_arrivals, 0)::numeric as backlog_open_from_arrivals
    from days d
    left join inventory_series i on i.day = d.day
    left join arrival_series a on a.day = d.day
    order by d.day
  )
  select
    (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'key', m.metric_key,
            'label', m.label,
            'total', m.total,
            'currentPeriod', m.current_period,
            'previousPeriod', m.previous_period,
            'delta', m.delta,
            'deltaPercent', m.delta_percent,
            'unit', m.unit,
            'trendPolarity', m.trend_polarity,
            'comparisonBasis', m.comparison_basis
          ) order by m.sort_order
        ),
        '[]'::jsonb
      )
      from metric_rows m
    ),
    (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'key', q.queue_key,
            'label', q.label,
            'status', q.status,
            'currentTotal', q.current_total,
            'currentPeriodArrivals', q.current_arrivals,
            'previousPeriodArrivals', q.previous_arrivals,
            'oldestQueuedAt', q.oldest_queued_at
          ) order by q.sort_order
        ),
        '[]'::jsonb
      )
      from queue_rows q
    ),
    (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'key', q.quality_key,
            'label', q.label,
            'status', q.status,
            'numerator', q.numerator,
            'denominator', q.denominator,
            'rate', q.rate,
            'previousNumerator', q.previous_numerator,
            'previousDenominator', q.previous_denominator,
            'previousRate', q.previous_rate,
            'deltaPoints', case
              when q.rate is not null and q.previous_rate is not null
                then pg_catalog.round(q.rate - q.previous_rate, 2)
              else null::numeric
            end,
            'disclosure', q.disclosure
          ) order by q.sort_order
        ),
        '[]'::jsonb
      )
      from quality_rates q
    ),
    (
      select pg_catalog.jsonb_build_object(
        'status', case
          when h.available_metric_count = 0 then 'unavailable'
          when h.available_metric_count < h.total_metric_count then 'partial'
          else 'available'
        end,
        'score', h.score,
        'previousScore', h.previous_score,
        'availableMetricCount', h.available_metric_count,
        'totalMetricCount', h.total_metric_count,
        'source', 'quality_average',
        'disclosure', 'Mevcut kalite oranlarinin aritmetik ortalamasidir; API, veritabani veya depolama telemetrisi degildir.'
      )
      from health_scores h
    ),
    (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'date', pg_catalog.to_char(s.day, 'YYYY-MM-DD'),
            'users', s.users,
            'mangas', s.mangas,
            'community', s.community,
            'fansubs', s.fansubs,
            'backlogArrivals', s.backlog_arrivals,
            'backlogOpenFromArrivals', s.backlog_open_from_arrivals
          ) order by s.day
        ),
        '[]'::jsonb
      )
      from series_rows s
    )
  into v_metrics, v_queues, v_quality, v_operation_health, v_series;
  return pg_catalog.jsonb_build_object(
    'period', pg_catalog.jsonb_build_object(
      'key', v_period,
      'timezone', v_timezone,
      'currentStart', v_current_start,
      'currentEnd', v_current_end,
      'previousStart', v_previous_start,
      'previousEnd', v_previous_end,
      'dayCount', v_day_count,
      'comparisonBasis', 'arrivals'
    ),
    'generatedAt', p_as_of,
    'metrics', v_metrics,
    'queues', v_queues,
    'quality', v_quality,
    'operationHealth', v_operation_health,
    'series', v_series,
    'partialFailures', '[]'::jsonb
  );
end;
$function$;
create or replace function public.get_admin_dashboard_snapshot(
  p_period text default '30d'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_admin_dashboard_snapshot(
    p_period,
    pg_catalog.statement_timestamp()
  );
$function$;
revoke all on function app_private.get_admin_dashboard_snapshot(text, timestamptz)
  from public, anon, authenticated;
grant execute on function app_private.get_admin_dashboard_snapshot(text, timestamptz)
  to authenticated, service_role;
revoke all on function public.get_admin_dashboard_snapshot(text)
  from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_snapshot(text)
  to authenticated, service_role;
comment on function public.get_admin_dashboard_snapshot(text) is
  'Admin dashboard icin Europe/Istanbul donem sinirli, arrivals karsilastirmali snapshot.';
notify pgrst, 'reload schema';
commit;
