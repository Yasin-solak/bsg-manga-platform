-- Gathers activity and moderation data for detailed user info in one admin-only snapshot.
-- Only existing event sources are used; no hypothetical score or history on the client.

begin;

create schema if not exists app_private;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.get_admin_user_detail_insights(
  p_user_id uuid,
  p_activity_days integer,
  p_event_limit integer,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_activity_days integer := greatest(7, least(coalesce(p_activity_days, 30), 90));
  v_event_limit integer := greatest(10, least(coalesce(p_event_limit, 80), 200));
  v_activity_start timestamptz;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(app_private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Bu detaylar icin admin yetkisi gerekir.';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Kullanici zorunludur.';
  end if;
  if p_as_of is null then
    raise exception using errcode = '22023', message = 'Snapshot zamani zorunludur.';
  end if;

  perform 1
  from public.users as target_user
  where target_user.id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Kullanici bulunamadi.';
  end if;

  -- Day boundaries are pinned to the admin panel product time zone.
  v_activity_start := (
    ((p_as_of at time zone 'Europe/Istanbul')::date - (v_activity_days - 1))::timestamp
    at time zone 'Europe/Istanbul'
  );

  with
  activity_source as materialized (
    select
      event.id,
      event.event_type,
      event.summary,
      event.manga_id,
      event.manga_title,
      event.chapter_id,
      event.chapter_number,
      event.route_hint,
      event.created_at,
      (event.created_at at time zone 'Europe/Istanbul')::date as local_date,
      extract(isodow from event.created_at at time zone 'Europe/Istanbul')::integer as weekday,
      extract(hour from event.created_at at time zone 'Europe/Istanbul')::integer as hour_of_day
    from public.activity_events as event
    where event.actor_type = 'user'
      and event.actor_user_id = p_user_id
      and event.is_active = true
      and event.created_at >= v_activity_start
      and event.created_at <= p_as_of
  ),
  day_axis as (
    select
      ((p_as_of at time zone 'Europe/Istanbul')::date - day_offset)::date as local_date
    from pg_catalog.generate_series(0, v_activity_days - 1) as series(day_offset)
  ),
  daily_activity as (
    select
      axis.local_date,
      pg_catalog.count(source.id)::integer as total,
      pg_catalog.count(source.id) filter (where source.event_type = 'user_read')::integer as reads,
      pg_catalog.count(source.id) filter (where source.event_type = 'user_comment')::integer as comments
    from day_axis as axis
    left join activity_source as source on source.local_date = axis.local_date
    group by axis.local_date
  ),
  activity_totals as (
    select
      pg_catalog.count(*)::integer as total,
      pg_catalog.count(*) filter (where event_type = 'user_read')::integer as reads,
      pg_catalog.count(*) filter (where event_type = 'user_comment')::integer as comments,
      pg_catalog.count(distinct local_date)::integer as active_days,
      pg_catalog.max(created_at) as last_at
    from activity_source
  ),
  activity_buckets as (
    select
      source.weekday,
      source.hour_of_day,
      pg_catalog.count(*)::integer as total
    from activity_source as source
    group by source.weekday, source.hour_of_day
  ),
  activity_events_limited as (
    select source.*
    from activity_source as source
    order by source.created_at desc, source.id desc
    limit v_event_limit
  ),
  security_source as materialized (
    select
      event.id::text as id,
      'security'::text as source,
      event.event_type as event_type,
      event.severity,
      event.message as summary,
      event.actor_user_id,
      actor.username as actor_username,
      actor.role as actor_role,
      event.created_at,
      case
        when event.event_type = 'user_banned' then 'enforced'
        when event.event_type = 'user_unbanned' then 'completed'
        else 'completed'
      end as outcome,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'banUntil', event.metadata -> 'banUntil',
        'previousRole', event.metadata -> 'previousRole',
        'newRole', event.metadata -> 'newRole'
      )) as metadata
    from public.security_events as event
    left join public.users as actor on actor.id = event.actor_user_id
    where event.target_user_id = p_user_id
      and event.created_at <= p_as_of
  ),
  audit_source as materialized (
    select
      audit.id::text as id,
      'audit'::text as source,
      audit.action as event_type,
      'low'::text as severity,
      audit.summary,
      audit.actor_user_id,
      actor.username as actor_username,
      audit.actor_role,
      audit.created_at,
      'completed'::text as outcome,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'previousRole', audit.metadata -> 'previousRole',
        'newRole', audit.metadata -> 'newRole'
      )) as metadata
    from public.audit_logs as audit
    left join public.users as actor on actor.id = audit.actor_user_id
    where audit.resource_type = 'user'
      and audit.resource_id = p_user_id::text
      and audit.action <> 'user.role.update'
      and audit.created_at <= p_as_of
  ),
  report_source as materialized (
    select
      report.id::text as id,
      'report'::text as source,
      'user_report'::text as event_type,
      case when report.status = 'pending' then 'medium' else 'low' end::text as severity,
      pg_catalog.left('Kullanici raporu: ' || report.reason, 500) as summary,
      report.reporter_id as actor_user_id,
      reporter.username as actor_username,
      reporter.role as actor_role,
      report.created_at,
      report.status as outcome,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'status', report.status,
        'resolvedAt', report.resolved_at
      )) as metadata
    from public.reports as report
    left join public.users as reporter on reporter.id = report.reporter_id
    where report.target_type = 'user'
      and report.target_id = p_user_id
      and report.created_at <= p_as_of
  ),
  moderation_timeline as (
    select * from security_source
    union all
    select * from audit_source
    union all
    select * from report_source
  ),
  moderation_events_limited as (
    select timeline.*
    from moderation_timeline as timeline
    order by timeline.created_at desc, timeline.id desc
    limit v_event_limit
  ),
  report_totals as (
    select
      pg_catalog.count(*)::integer as total,
      pg_catalog.count(*) filter (where status = 'pending')::integer as pending,
      pg_catalog.count(*) filter (where status = 'resolved')::integer as resolved,
      pg_catalog.count(*) filter (where status = 'dismissed')::integer as dismissed
    from public.reports as report
    where report.target_type = 'user'
      and report.target_id = p_user_id
      and report.created_at <= p_as_of
  ),
  target_state as (
    select
      coalesce(target_user.is_banned, false) as is_banned,
      target_user.ban_reason,
      target_user.ban_until,
      target_user.banned_at
    from public.users as target_user
    where target_user.id = p_user_id
  )
  select pg_catalog.jsonb_build_object(
    'generatedAt', p_as_of,
    'windowDays', v_activity_days,
    'activity', pg_catalog.jsonb_build_object(
      'total', totals.total,
      'reads', totals.reads,
      'comments', totals.comments,
      'activeDays', totals.active_days,
      'lastAt', totals.last_at,
      'daily', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'date', daily.local_date,
            'total', daily.total,
            'reads', daily.reads,
            'comments', daily.comments
          ) order by daily.local_date
        )
        from daily_activity as daily
      ), '[]'::jsonb),
      'timeBuckets', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'weekday', bucket.weekday,
            'hour', bucket.hour_of_day,
            'total', bucket.total
          ) order by bucket.weekday, bucket.hour_of_day
        )
        from activity_buckets as bucket
      ), '[]'::jsonb),
      'events', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', event.id::text,
            'type', event.event_type,
            'summary', event.summary,
            'mangaId', event.manga_id,
            'mangaTitle', event.manga_title,
            'chapterId', event.chapter_id,
            'chapterNumber', event.chapter_number,
            'routeHint', event.route_hint,
            'createdAt', event.created_at
          ) order by event.created_at desc, event.id desc
        )
        from activity_events_limited as event
      ), '[]'::jsonb)
    ),
    'moderation', pg_catalog.jsonb_build_object(
      'reports', pg_catalog.jsonb_build_object(
        'total', report_counts.total,
        'pending', report_counts.pending,
        'resolved', report_counts.resolved,
        'dismissed', report_counts.dismissed
      ),
      'securityEventCount', (select pg_catalog.count(*)::integer from security_source),
      'adminActionCount', (select pg_catalog.count(*)::integer from audit_source),
      'currentBan', pg_catalog.jsonb_build_object(
        'isBanned', target.is_banned,
        'reason', target.ban_reason,
        'until', target.ban_until,
        'bannedAt', target.banned_at
      ),
      'events', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', event.id,
            'source', event.source,
            'type', event.event_type,
            'severity', event.severity,
            'summary', event.summary,
            'actorUserId', event.actor_user_id,
            'actorUsername', event.actor_username,
            'actorRole', event.actor_role,
            'createdAt', event.created_at,
            'outcome', event.outcome,
            'metadata', event.metadata
          ) order by event.created_at desc, event.id desc
        )
        from moderation_events_limited as event
      ), '[]'::jsonb)
    )
  ) into v_result
  from activity_totals as totals
  cross join report_totals as report_counts
  cross join target_state as target;

  return v_result;
end;
$function$;

create or replace function public.get_admin_user_detail_insights(
  p_user_id uuid,
  p_activity_days integer default 30,
  p_event_limit integer default 80
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_private.get_admin_user_detail_insights(
    p_user_id,
    p_activity_days,
    p_event_limit,
    pg_catalog.statement_timestamp()
  );
$function$;

revoke all on function app_private.get_admin_user_detail_insights(
  uuid, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.get_admin_user_detail_insights(
  uuid, integer, integer, timestamptz
) to authenticated, service_role;

revoke all on function public.get_admin_user_detail_insights(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_admin_user_detail_insights(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_admin_user_detail_insights(uuid, integer, integer) is
  'Admin detay penceresi icin dogrulanmis aktivite ve moderasyon snapshoti.';

notify pgrst, 'reload schema';
commit;
