create or replace function support_internal.evaluate_diagnostic_alerts() returns integer language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
  insert into support_internal.diagnostic_alerts(kind,dimension,window_start,samples,value)
  select code,route||' / '||(technical->>'device'),date_trunc('hour',now()),count(*),case when code in ('lcp','inp','cls') then percentile_cont(0.75) within group(order by metric_value) else count(*) end
  from public.diagnostic_events where created_at>now()-interval '1 hour' and code in ('ui_error','promise_error','media_error','service_error','render_error','lcp','inp','cls')
  group by code,route,technical->>'device' having count(*)>=20 and count(distinct user_id)>=5 and (
    code in ('ui_error','promise_error','media_error','service_error','render_error')
    or percentile_cont(0.75) within group(order by metric_value)>case code when 'lcp' then 4000 when 'inp' then 500 when 'cls' then 0.25 end
  ) on conflict do nothing;
  get diagnostics inserted=row_count;
  if exists(select 1 from support_internal.diagnostic_maintenance where last_cleanup<now()-interval '36 hours' or last_cleanup is null)
    or exists(select 1 from support_internal.screenshot_cleanup_config where last_success<now()-interval '3 hours' or last_success is null) then
    insert into support_internal.diagnostic_alerts(kind,dimension,window_start,samples) values('cleanup_delayed','retention',date_trunc('day',now()),0) on conflict do nothing;
  end if;
  delete from support_internal.diagnostic_alerts where created_at<now()-interval '90 days';
  return inserted;
end $$;
revoke all on function support_internal.evaluate_diagnostic_alerts() from public,anon,authenticated;
