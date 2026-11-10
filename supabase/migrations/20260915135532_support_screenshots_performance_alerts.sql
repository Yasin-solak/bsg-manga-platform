-- Screenshots are in private storage reached only by their owner and the site admin.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('support-screenshots','support-screenshots',false,1048576,array['image/jpeg']);
create table public.support_attachments (
  request_id uuid primary key references public.support_requests(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.support_attachments enable row level security;
revoke all on public.support_attachments from public,anon,authenticated;
grant select on public.support_attachments to authenticated;
create policy support_attachment_read on public.support_attachments for select to authenticated using(
  created_at>now()-interval '30 days' and exists(select 1 from public.support_requests r where r.id=request_id and (r.user_id=(select auth.uid()) or (select support_internal.is_support_admin())))
);

create function support_internal.can_access_screenshot(object_name text,write_access boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare req public.support_requests;
begin
  if auth.uid() is null or object_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/screenshot\.jpg$' then return false; end if;
  select * into req from public.support_requests where id=split_part(object_name,'/',2)::uuid and user_id=split_part(object_name,'/',1)::uuid;
  if req.id is null then return false; end if;
  if write_access then return req.user_id=auth.uid() and req.created_at>now()-interval '30 days'; end if;
  return req.created_at>now()-interval '30 days' and (req.user_id=auth.uid() or support_internal.is_support_admin()) and exists(select 1 from public.support_attachments where request_id=req.id and created_at>now()-interval '30 days');
exception when invalid_text_representation then return false;
end $$;
revoke all on function support_internal.can_access_screenshot(text,boolean) from public,anon;
grant execute on function support_internal.can_access_screenshot(text,boolean) to authenticated;
create policy support_screenshot_insert on storage.objects for insert to authenticated with check(bucket_id='support-screenshots' and support_internal.can_access_screenshot(name,true));
create policy support_screenshot_select on storage.objects for select to authenticated using(bucket_id='support-screenshots' and support_internal.can_access_screenshot(name,false));
create policy support_screenshot_delete on storage.objects for delete to authenticated using(bucket_id='support-screenshots' and support_internal.can_access_screenshot(name,true));

create function support_internal.attach_support_screenshot(request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare object_name text;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
  object_name=auth.uid()::text||'/'||request_id::text||'/screenshot.jpg';
  if not support_internal.can_access_screenshot(object_name,true) or not exists(select 1 from storage.objects where bucket_id='support-screenshots' and name=object_name) then raise exception 'forbidden' using errcode='42501'; end if;
  insert into public.support_attachments(request_id) values(request_id) on conflict do nothing;
end $$;
revoke all on function support_internal.attach_support_screenshot(uuid) from public,anon;
grant execute on function support_internal.attach_support_screenshot(uuid) to authenticated;
create function public.attach_support_screenshot(request_id uuid) returns void language sql security invoker set search_path='' as $$select support_internal.attach_support_screenshot(request_id)$$;
revoke all on function public.attach_support_screenshot(uuid) from public,anon;
grant execute on function public.attach_support_screenshot(uuid) to authenticated;
create function support_internal.detach_support_screenshot(request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.support_requests r where r.id=request_id and r.user_id=auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
  delete from public.support_attachments a where a.request_id=detach_support_screenshot.request_id;
end $$;
revoke all on function support_internal.detach_support_screenshot(uuid) from public,anon;
grant execute on function support_internal.detach_support_screenshot(uuid) to authenticated;
create function public.detach_support_screenshot(request_id uuid) returns void language sql security invoker set search_path='' as $$select support_internal.detach_support_screenshot(request_id)$$;
revoke all on function public.detach_support_screenshot(uuid) from public,anon;
grant execute on function public.detach_support_screenshot(uuid) to authenticated;

-- The job key is not written to output; it goes only to the cleanup function in the same Supabase project.
create table support_internal.screenshot_cleanup_config(id boolean primary key default true check(id), secret text not null default encode(extensions.gen_random_bytes(32),'hex'),last_success timestamptz);
alter table support_internal.screenshot_cleanup_config enable row level security;
revoke all on support_internal.screenshot_cleanup_config from public,anon,authenticated;
insert into support_internal.screenshot_cleanup_config(id) values(true);
create function support_internal.claim_support_screenshot_cleanup(job_secret text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from support_internal.screenshot_cleanup_config where secret=job_secret) then raise exception 'forbidden' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(name),'[]'::jsonb) from (
    select o.name from storage.objects o
    left join public.support_requests r on o.name=r.user_id::text||'/'||r.id::text||'/screenshot.jpg'
    left join public.support_attachments a on a.request_id=r.id
    where o.bucket_id='support-screenshots' and (o.created_at<now()-interval '30 days' or r.created_at<now()-interval '30 days' or (a.request_id is null and o.created_at<now()-interval '1 day'))
    order by o.created_at limit 100
  ) expired);
end $$;
revoke all on function support_internal.claim_support_screenshot_cleanup(text) from public,anon,authenticated;
grant execute on function support_internal.claim_support_screenshot_cleanup(text) to service_role;
create function support_internal.finish_support_screenshot_cleanup(job_secret text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from support_internal.screenshot_cleanup_config where secret=job_secret) then raise exception 'forbidden' using errcode='42501'; end if;
  delete from public.support_attachments a where not exists(select 1 from storage.objects o join public.support_requests r on o.name=r.user_id::text||'/'||r.id::text||'/screenshot.jpg' where o.bucket_id='support-screenshots' and r.id=a.request_id);
  update support_internal.screenshot_cleanup_config set last_success=now() where id;
end $$;
revoke all on function support_internal.finish_support_screenshot_cleanup(text) from public,anon,authenticated;
grant execute on function support_internal.finish_support_screenshot_cleanup(text) to service_role;
create function support_internal.dispatch_screenshot_cleanup() returns bigint language sql security invoker set search_path='' as $$
  select net.http_post(url:='https://your-project-ref.supabase.co/functions/v1/support-screenshot-cleanup',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('secret',secret),timeout_milliseconds:=30000)
  from support_internal.screenshot_cleanup_config where id
$$;
revoke all on function support_internal.dispatch_screenshot_cleanup() from public,anon,authenticated;
select cron.schedule('bsg-support-screenshot-cleanup','*/5 * * * *','select support_internal.dispatch_screenshot_cleanup()');

-- Old consent does not open advanced performance fields. The new UI asks consent again for version 2.
alter table public.diagnostic_preferences drop constraint diagnostic_preferences_version_check;
alter table public.diagnostic_preferences add constraint diagnostic_preferences_version_check check(version in (1,2));
alter table public.diagnostic_events drop constraint diagnostic_events_code_check;
alter table public.diagnostic_events drop constraint diagnostic_events_check;
alter table public.diagnostic_events add column metric_value numeric;
alter table public.diagnostic_events add column updated_at timestamptz not null default now();
alter table public.diagnostic_events add constraint diagnostic_events_code_check check(code in ('ui_error','promise_error','media_error','service_error','render_error','page_load','lcp','inp','cls','fcp','ttfb'));
alter table public.diagnostic_events add constraint diagnostic_events_payload_check check(
  (code='page_load' and duration_ms is not null and metric_value is null)
  or (code in ('lcp','inp','fcp','ttfb') and duration_ms is null and metric_value is not null and metric_value between 0 and 120000)
  or (code='cls' and duration_ms is null and metric_value is not null and metric_value between 0 and 10)
  or (code in ('ui_error','promise_error','media_error','service_error','render_error') and duration_ms is null and metric_value is null)
);
create table support_internal.diagnostic_control(id boolean primary key default true check(id),enabled boolean not null default true);
alter table support_internal.diagnostic_control enable row level security;
revoke all on support_internal.diagnostic_control from public,anon,authenticated;
insert into support_internal.diagnostic_control(id) values(true);
create function support_internal.diagnostic_collection_enabled() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and coalesce((select enabled from support_internal.diagnostic_control where id),false)$$;
revoke all on function support_internal.diagnostic_collection_enabled() from public,anon;
grant execute on function support_internal.diagnostic_collection_enabled() to authenticated;
create function public.diagnostic_collection_enabled() returns boolean language sql security invoker set search_path='' as $$select support_internal.diagnostic_collection_enabled()$$;
revoke all on function public.diagnostic_collection_enabled() from public,anon;
grant execute on function public.diagnostic_collection_enabled() to authenticated;
create function support_internal.set_diagnostic_collection(value boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not support_internal.is_support_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  update support_internal.diagnostic_control set enabled=value where id;
  insert into support_internal.diagnostic_access(actor) values(auth.uid());
end $$;
revoke all on function support_internal.set_diagnostic_collection(boolean) from public,anon;
grant execute on function support_internal.set_diagnostic_collection(boolean) to authenticated;
create function public.set_diagnostic_collection(value boolean) returns void language sql security invoker set search_path='' as $$select support_internal.set_diagnostic_collection(value)$$;
revoke all on function public.set_diagnostic_collection(boolean) from public,anon;
grant execute on function public.set_diagnostic_collection(boolean) to authenticated;
create or replace function support_internal.guard_diagnostic_event() returns trigger language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,8150));
  if not support_internal.diagnostic_collection_enabled() or not exists(select 1 from public.diagnostic_preferences where user_id=auth.uid() and enabled and version>=case when new.code in ('lcp','inp','cls','fcp','ttfb') then 2 else 1 end) then raise exception 'diagnostic_consent_required' using errcode='42501'; end if;
  if (select count(*) from public.diagnostic_events where user_id=auth.uid() and created_at>now()-interval '1 minute')>=10 or (select count(*) from public.diagnostic_events where user_id=auth.uid() and created_at>now()-interval '1 day')>=100 then raise exception 'diagnostic_rate_limit' using errcode='P0001'; end if;
  return new;
end $$;
create function support_internal.record_diagnostic_metric(event_id uuid,session uuid,metric text,value numeric,route_name text,environment jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or metric not in ('lcp','inp','cls','fcp','ttfb') or not support_internal.diagnostic_collection_enabled() or not exists(select 1 from public.diagnostic_preferences where user_id=auth.uid() and enabled and version=2) then raise exception 'forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,8150));
  if exists(select 1 from public.diagnostic_events where id=event_id) then
    update public.diagnostic_events set metric_value=value,updated_at=now() where id=event_id and user_id=auth.uid() and code=metric and session_id=session and updated_at<now()-interval '25 seconds';
  else
    insert into public.diagnostic_events(id,user_id,session_id,code,route,technical,metric_value) values(event_id,auth.uid(),session,metric,route_name,environment,value);
  end if;
end $$;
revoke all on function support_internal.record_diagnostic_metric(uuid,uuid,text,numeric,text,jsonb) from public,anon;
grant execute on function support_internal.record_diagnostic_metric(uuid,uuid,text,numeric,text,jsonb) to authenticated;
create function public.record_diagnostic_metric(event_id uuid,session uuid,metric text,value numeric,route_name text,environment jsonb) returns void language sql security invoker set search_path='' as $$select support_internal.record_diagnostic_metric(event_id,session,metric,value,route_name,environment)$$;
revoke all on function public.record_diagnostic_metric(uuid,uuid,text,numeric,text,jsonb) from public,anon;
grant execute on function public.record_diagnostic_metric(uuid,uuid,text,numeric,text,jsonb) to authenticated;

-- Alarms hold no personal content. Not produced again for the same hour and breakdown.
create table support_internal.diagnostic_alerts (
  id uuid primary key default gen_random_uuid(),kind text not null,dimension text not null,
  window_start timestamptz not null,samples bigint not null,value numeric,
  created_at timestamptz not null default now(),acknowledged_at timestamptz,
  unique(kind,dimension,window_start)
);
alter table support_internal.diagnostic_alerts enable row level security;
revoke all on support_internal.diagnostic_alerts from public,anon,authenticated;
create index diagnostic_alerts_created_idx on support_internal.diagnostic_alerts(created_at);
create function support_internal.evaluate_diagnostic_alerts() returns integer language plpgsql security invoker set search_path='' as $$
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
    or exists(select 1 from support_internal.screenshot_cleanup_config where last_success<now()-interval '3 hours') then
    insert into support_internal.diagnostic_alerts(kind,dimension,window_start,samples) values('cleanup_delayed','retention',date_trunc('day',now()),0) on conflict do nothing;
  end if;
  delete from support_internal.diagnostic_alerts where created_at<now()-interval '90 days';
  return inserted;
end $$;
revoke all on function support_internal.evaluate_diagnostic_alerts() from public,anon,authenticated;
select cron.schedule('bsg-diagnostics-alerts','*/15 * * * *','select support_internal.evaluate_diagnostic_alerts()');
create function support_internal.acknowledge_diagnostic_alert(alert_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not support_internal.is_support_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  update support_internal.diagnostic_alerts set acknowledged_at=now() where id=alert_id;
  insert into support_internal.diagnostic_access(actor) values(auth.uid());
end $$;
revoke all on function support_internal.acknowledge_diagnostic_alert(uuid) from public,anon;
grant execute on function support_internal.acknowledge_diagnostic_alert(uuid) to authenticated;
create function public.acknowledge_diagnostic_alert(alert_id uuid) returns void language sql security invoker set search_path='' as $$select support_internal.acknowledge_diagnostic_alert(alert_id)$$;
revoke all on function public.acknowledge_diagnostic_alert(uuid) from public,anon;
grant execute on function public.acknowledge_diagnostic_alert(uuid) to authenticated;

create function public.claim_support_screenshot_cleanup(job_secret text) returns jsonb language sql security invoker set search_path='' as $$select support_internal.claim_support_screenshot_cleanup(job_secret)$$;
revoke all on function public.claim_support_screenshot_cleanup(text) from public,anon,authenticated;
grant execute on function public.claim_support_screenshot_cleanup(text) to service_role;

create function public.finish_support_screenshot_cleanup(job_secret text) returns void language sql security invoker set search_path='' as $$select support_internal.finish_support_screenshot_cleanup(job_secret)$$;
revoke all on function public.finish_support_screenshot_cleanup(text) from public,anon,authenticated;
grant execute on function public.finish_support_screenshot_cleanup(text) to service_role;

grant usage on schema support_internal to service_role;

create or replace function support_internal.diagnostic_overview() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not support_internal.is_support_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  insert into support_internal.diagnostic_access(actor) values(auth.uid());
  select jsonb_build_object(
    'total',count(*),'accounts',count(distinct user_id),
    'p75',percentile_cont(0.75) within group(order by duration_ms) filter(where code='page_load'),
    'groups',(select coalesce(jsonb_agg(g),'[]') from (select code,route,technical->>'build' as build,technical->>'device' as device,count(*) as count from public.diagnostic_events where created_at>now()-interval '14 days' group by 1,2,3,4 order by count(*) desc limit 30) g),
    'recent',(select coalesce(jsonb_agg(r),'[]') from (select e.id,e.user_id,u.username,e.code,e.route,e.created_at,e.technical from public.diagnostic_events e left join public.users u on u.auth_user_id=e.user_id where e.created_at>now()-interval '14 days' order by e.created_at desc limit 50) r),
    'cleanup_at',(select last_cleanup from support_internal.diagnostic_maintenance where id)
  ) into result from public.diagnostic_events where created_at>now()-interval '14 days';
  return result || jsonb_build_object(
    'collection_enabled',(select enabled from support_internal.diagnostic_control where id),
    'screenshot_cleanup_at',(select last_success from support_internal.screenshot_cleanup_config where id),
    'metrics',(select coalesce(jsonb_agg(m),'[]') from (select code,count(*) as samples,round((percentile_cont(0.5) within group(order by metric_value))::numeric,3) as p50,round((percentile_cont(0.75) within group(order by metric_value))::numeric,3) as p75,round((percentile_cont(0.95) within group(order by metric_value))::numeric,3) as p95 from public.diagnostic_events where created_at>now()-interval '14 days' and code in ('lcp','inp','cls','fcp','ttfb') group by code) m),
    'alerts',(select coalesce(jsonb_agg(a),'[]') from (select id,kind,dimension,samples,value,created_at,acknowledged_at from support_internal.diagnostic_alerts order by created_at desc limit 50) a)
  );
end $$;

create function support_internal.notify_diagnostic_alert() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  insert into public.notifications(user_id,type,title,message,icon,data)
  select id,'system','Tanılama uyarısı',new.dimension||' alanında '||new.kind||' eşiği aşıldı. Yönetici tanılama ekranını inceleyebilirsin.','warning',jsonb_build_object('event','diagnostic_alert','route_hint','/ayarlar?bolum=destek','alert_id',new.id)
  from public.users where role='admin';
  return new;
end $$;
revoke all on function support_internal.notify_diagnostic_alert() from public,anon,authenticated;
create trigger diagnostic_alert_notification after insert on support_internal.diagnostic_alerts for each row execute function support_internal.notify_diagnostic_alert();
