-- Technical reports are limited to allowed fields; identity is tied on the server with auth.uid().
create or replace function support_internal.valid_technical(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  return coalesce(jsonb_typeof(v)='object' and pg_column_size(v)<4096
    and (v - array['version','build','browser','browserMajor','os','device','width','height','theme','reducedMotion','online','notification','serviceWorker'])='{}'::jsonb
    and v ?& array['version','build','browser','browserMajor','os','device','width','height','theme','reducedMotion','online','notification','serviceWorker']
    and v->'version'='1'::jsonb and v->>'build' ~ '^[a-zA-Z0-9.-]{1,40}$'
    and v->>'browser' in ('Chrome','Edge','Firefox','Safari','Other')
    and jsonb_typeof(v->'browserMajor')='number' and (v->>'browserMajor')::int between 0 and 999
    and v->>'os' in ('Windows','macOS','Android','iOS','Linux','Other')
    and v->>'device' in ('mobile','desktop') and v->>'theme' in ('light','dark')
    and jsonb_typeof(v->'width')='number' and (v->>'width')::int between 0 and 10000
    and jsonb_typeof(v->'height')='number' and (v->>'height')::int between 0 and 10000
    and jsonb_typeof(v->'reducedMotion')='boolean' and jsonb_typeof(v->'online')='boolean'
    and jsonb_typeof(v->'serviceWorker')='boolean'
    and v->>'notification' in ('unsupported','default','granted','denied'), false);
exception when others then return false;
end $$;
revoke all on function support_internal.valid_technical(jsonb) from public,anon;
grant execute on function support_internal.valid_technical(jsonb) to authenticated;

create or replace function support_internal.valid_support_context(v jsonb) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(v)='object' and pg_column_size(v)<1024
    and (v-array['premium','content','transaction'])='{}'::jsonb
    and v ?& array['premium','content','transaction']
    and jsonb_typeof(v->'premium')='boolean'
    and jsonb_typeof(v->'content')='string' and length(v->>'content')<=120
    and jsonb_typeof(v->'transaction')='string' and v->>'transaction' ~ '^[a-zA-Z0-9_-]{0,80}$', false)
$$;
revoke all on function support_internal.valid_support_context(jsonb) from public,anon;
grant execute on function support_internal.valid_support_context(jsonb) to authenticated;

alter table public.support_requests add column technical jsonb check(technical is null or support_internal.valid_technical(technical));
alter table public.support_requests add column account_context jsonb check(account_context is null or support_internal.valid_support_context(account_context));
grant insert(technical,account_context) on public.support_requests to authenticated;
create index support_requests_report_retention_idx on public.support_requests(created_at) where technical is not null or account_context is not null;

create table public.diagnostic_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  version integer not null default 1 check(version=1),
  updated_at timestamptz not null default now()
);
alter table public.diagnostic_preferences enable row level security;
revoke all on public.diagnostic_preferences from public,anon,authenticated;
grant select,insert(user_id,enabled,version),update(user_id,enabled,version) on public.diagnostic_preferences to authenticated;
create policy diagnostic_preferences_owner_select on public.diagnostic_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy diagnostic_preferences_owner_insert on public.diagnostic_preferences for insert to authenticated with check(user_id=(select auth.uid()));
create policy diagnostic_preferences_owner_update on public.diagnostic_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create or replace function support_internal.guard_diagnostic_preference() returns trigger language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,8150));
  new.updated_at=now(); return new;
end $$;
revoke all on function support_internal.guard_diagnostic_preference() from public,anon,authenticated;
create trigger diagnostic_preference_guard before insert or update on public.diagnostic_preferences for each row execute function support_internal.guard_diagnostic_preference();

create table public.diagnostic_events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null,
  code text not null check(code in ('ui_error','promise_error','media_error','service_error','render_error','page_load')),
  route text not null check(route in ('home','reader','kesfet','ayarlar','bildirimler','giris','magaza','profil','fansublar','other')),
  technical jsonb not null check(support_internal.valid_technical(technical)),
  duration_ms integer check(duration_ms between 0 and 120000),
  created_at timestamptz not null default now(),
  check((code='page_load')=(duration_ms is not null))
);
create index diagnostic_events_owner_time_idx on public.diagnostic_events(user_id,created_at desc);
create index diagnostic_events_time_idx on public.diagnostic_events(created_at desc);
alter table public.diagnostic_events enable row level security;
revoke all on public.diagnostic_events from public,anon,authenticated;
grant insert(id,session_id,code,route,technical,duration_ms),select,delete on public.diagnostic_events to authenticated;
create policy diagnostic_events_owner_select on public.diagnostic_events for select to authenticated using(user_id=(select auth.uid()));
create policy diagnostic_events_owner_insert on public.diagnostic_events for insert to authenticated with check(user_id=(select auth.uid()));
create policy diagnostic_events_owner_delete on public.diagnostic_events for delete to authenticated using(user_id=(select auth.uid()));
create or replace function support_internal.guard_diagnostic_event() returns trigger language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,8150));
  if not exists(select 1 from public.diagnostic_preferences where user_id=auth.uid() and enabled and version=1) then
    raise exception 'diagnostic_consent_required' using errcode='42501';
  end if;
  if (select count(*) from public.diagnostic_events where user_id=auth.uid() and created_at>now()-interval '1 minute')>=10
    or (select count(*) from public.diagnostic_events where user_id=auth.uid() and created_at>now()-interval '1 day')>=100 then
    raise exception 'diagnostic_rate_limit' using errcode='P0001';
  end if;
  return new;
end $$;
revoke all on function support_internal.guard_diagnostic_event() from public,anon,authenticated;
create trigger diagnostic_event_guard before insert on public.diagnostic_events for each row execute function support_internal.guard_diagnostic_event();

-- Admin reads go only through a narrow RPC that leaves an audit record.
create table support_internal.diagnostic_access (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table support_internal.diagnostic_access enable row level security;
revoke all on support_internal.diagnostic_access from public,anon,authenticated;
create table support_internal.diagnostic_maintenance (id boolean primary key default true check(id),last_cleanup timestamptz);
alter table support_internal.diagnostic_maintenance enable row level security;
revoke all on support_internal.diagnostic_maintenance from public,anon,authenticated;
insert into support_internal.diagnostic_maintenance(id) values(true);

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
  return result;
end $$;
revoke all on function support_internal.diagnostic_overview() from public,anon;
grant execute on function support_internal.diagnostic_overview() to authenticated;
create or replace function public.diagnostic_overview() returns jsonb language sql security invoker set search_path='' as $$select support_internal.diagnostic_overview()$$;
revoke all on function public.diagnostic_overview() from public,anon;
grant execute on function public.diagnostic_overview() to authenticated;

-- Removes only your own attachment without widening support_requests UPDATE permission for clients.
create or replace function support_internal.clear_my_support_diagnostics(request_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
  -- The existing admin reply trigger allows this cleanup only when the reply is unchanged.
  update public.support_requests set technical=null,account_context=null where id=request_id and user_id=auth.uid();
end $$;
revoke all on function support_internal.clear_my_support_diagnostics(uuid) from public,anon;
grant execute on function support_internal.clear_my_support_diagnostics(uuid) to authenticated;
create or replace function public.clear_my_support_diagnostics(request_id uuid) returns void language sql security invoker set search_path='' as $$select support_internal.clear_my_support_diagnostics(request_id)$$;
revoke all on function public.clear_my_support_diagnostics(uuid) from public,anon;
grant execute on function public.clear_my_support_diagnostics(uuid) to authenticated;
create or replace function public.delete_my_diagnostics() returns void language sql security invoker set search_path='' as $$delete from public.diagnostic_events where user_id=auth.uid()$$;
revoke all on function public.delete_my_diagnostics() from public,anon;
grant execute on function public.delete_my_diagnostics() to authenticated;

create or replace function support_internal.guard_request() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if auth.uid() is null then raise exception 'Giriş yapmalısın.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,8149));
    -- A retry with the same request id does not use up the daily limit.
    if not exists(select 1 from public.support_requests where id=new.id and user_id=auth.uid())
      and (select count(*) from public.support_requests where user_id=auth.uid() and created_at>now()-interval '24 hours') >=5 then
      raise exception '24 saat içinde en fazla 5 destek talebi gönderebilirsin.' using errcode='P0001';
    end if;
  else
    if new.technical is null and new.account_context is null and
      (to_jsonb(new)-array['technical','account_context'])=(to_jsonb(old)-array['technical','account_context']) then return new; end if;
    if not support_internal.is_support_admin() then raise exception 'Yetkisiz işlem.' using errcode='42501'; end if;
    new.responded_at=case when new.admin_response is distinct from old.admin_response then now() else old.responded_at end;
    if new.status='answered' and coalesce(char_length(btrim(new.admin_response)),0)<5 then
      raise exception 'Yanıt en az 5 karakter olmalı.';
    end if;
  end if;
  return new;
end $$;

-- Daily cleanup affects only new technical data; support messages are kept.
create or replace function support_internal.cleanup_diagnostics() returns void language plpgsql security invoker set search_path='' as $$
begin
  delete from public.diagnostic_events where created_at<now()-interval '14 days';
  update public.support_requests set technical=null,account_context=null where created_at<now()-interval '30 days' and (technical is not null or account_context is not null);
  delete from support_internal.diagnostic_access where created_at<now()-interval '90 days';
  update support_internal.diagnostic_maintenance set last_cleanup=now() where id;
end $$;
revoke all on function support_internal.cleanup_diagnostics() from public,anon,authenticated;
create extension if not exists pg_cron;
select cron.schedule('bsg-diagnostics-retention','17 2 * * *','select support_internal.cleanup_diagnostics()');
