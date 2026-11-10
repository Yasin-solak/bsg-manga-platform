-- ============================================
-- BSG Manga | Security Ops Phase 4 (Alert + Mute)
-- Date: 2026-02-15
-- ============================================

begin;

-- --------------------------------------------
-- Alert rules (threshold configuration)
-- --------------------------------------------
create table if not exists public.security_alert_rules (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(trim(event_type)) > 0),
  source text,
  scope_type text not null default 'target_user'
    check (scope_type in ('global', 'target_user', 'actor_user')),
  window_minutes int not null default 10
    check (window_minutes >= 1 and window_minutes <= 24 * 60),
  threshold_count int not null default 1
    check (threshold_count >= 1 and threshold_count <= 1000),
  dedupe_minutes int not null default 30
    check (dedupe_minutes >= 1 and dedupe_minutes <= 24 * 60),
  severity text not null default 'high'
    check (severity in ('low', 'medium', 'high', 'critical')),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists security_alert_rules_unique_idx
  on public.security_alert_rules (lower(event_type), coalesce(lower(source), ''), scope_type);

create index if not exists security_alert_rules_active_idx
  on public.security_alert_rules (is_active, event_type);

drop trigger if exists trg_set_updated_at_security_alert_rules on public.security_alert_rules;
create trigger trg_set_updated_at_security_alert_rules
before update on public.security_alert_rules
for each row execute function public.set_updated_at();

-- --------------------------------------------
-- Alert state table (open / acknowledged / resolved)
-- --------------------------------------------
create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.security_alert_rules(id) on delete cascade,
  event_type text not null,
  source text,
  scope_type text not null
    check (scope_type in ('global', 'target_user', 'actor_user')),
  scope_key text not null,
  scope_user_id uuid references public.users(id) on delete set null,
  severity text not null
    check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved')),
  title text not null,
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  hit_count int not null default 1
    check (hit_count >= 1),
  first_hit_at timestamptz not null default now(),
  last_hit_at timestamptz not null default now(),
  last_notified_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists security_alerts_active_unique_idx
  on public.security_alerts (rule_id, scope_key)
  where status in ('open', 'acknowledged');

create index if not exists security_alerts_status_last_hit_idx
  on public.security_alerts (status, last_hit_at desc);

create index if not exists security_alerts_event_type_idx
  on public.security_alerts (event_type);

create index if not exists security_alerts_scope_user_idx
  on public.security_alerts (scope_user_id);

drop trigger if exists trg_set_updated_at_security_alerts on public.security_alerts;
create trigger trg_set_updated_at_security_alerts
before update on public.security_alerts
for each row execute function public.set_updated_at();

-- --------------------------------------------
-- Alert mute/snooze table
-- --------------------------------------------
create table if not exists public.security_alert_mutes (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(trim(event_type)) > 0),
  source text,
  muted_until timestamptz not null,
  reason text,
  muted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists security_alert_mutes_unique_idx
  on public.security_alert_mutes (lower(event_type), coalesce(lower(source), ''));

create index if not exists security_alert_mutes_until_idx
  on public.security_alert_mutes (muted_until desc);

drop trigger if exists trg_set_updated_at_security_alert_mutes on public.security_alert_mutes;
create trigger trg_set_updated_at_security_alert_mutes
before update on public.security_alert_mutes
for each row execute function public.set_updated_at();

-- --------------------------------------------
-- RLS
-- --------------------------------------------
alter table public.security_alert_rules enable row level security;
alter table public.security_alerts enable row level security;
alter table public.security_alert_mutes enable row level security;

drop policy if exists security_alert_rules_admin_all on public.security_alert_rules;
create policy security_alert_rules_admin_all
  on public.security_alert_rules
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists security_alerts_admin_all on public.security_alerts;
create policy security_alerts_admin_all
  on public.security_alerts
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists security_alert_mutes_admin_all on public.security_alert_mutes;
create policy security_alert_mutes_admin_all
  on public.security_alert_mutes
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.security_alert_rules to authenticated;
grant select, insert, update, delete on public.security_alerts to authenticated;
grant select, insert, update, delete on public.security_alert_mutes to authenticated;

-- --------------------------------------------
-- Helpers: admin notification integration + dedupe window
-- --------------------------------------------
create or replace function public.notify_admins_security_alert(
  p_alert_id uuid,
  p_dedupe_minutes int default 30
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert record;
  v_admin record;
  v_sent_count int := 0;
  v_dedupe_minutes int := greatest(1, least(coalesce(p_dedupe_minutes, 30), 24 * 60));
  v_bucket bigint := floor(extract(epoch from now()) / (v_dedupe_minutes * 60));
  v_event_key text;
begin
  if p_alert_id is null then
    return 0;
  end if;

  select
    a.id,
    a.event_type,
    a.source,
    a.scope_key,
    a.severity,
    a.status,
    a.title,
    a.message,
    a.hit_count
  into v_alert
  from public.security_alerts a
  where a.id = p_alert_id;

  if not found then
    return 0;
  end if;

  v_event_key := format('security_alert:%s:%s', p_alert_id, v_bucket);

  for v_admin in
    select u.id
    from public.users u
    where u.role = 'admin'
      and u.is_active = true
  loop
    perform public.push_notification(
      v_admin.id,
      'system',
      coalesce(nullif(trim(v_alert.title), ''), 'Guvenlik alarmi'),
      left(
        coalesce(nullif(trim(v_alert.message), ''), format('%s alarmi olustu.', v_alert.event_type)),
        500
      ),
      jsonb_build_object(
        'event', 'security_alert',
        'alert_id', v_alert.id,
        'event_type', v_alert.event_type,
        'source', v_alert.source,
        'severity', v_alert.severity,
        'status', v_alert.status,
        'scope_key', v_alert.scope_key,
        'hit_count', v_alert.hit_count,
        'route_hint', '/admin',
        'event_key', v_event_key
      ),
      null
    );
    v_sent_count := v_sent_count + 1;
  end loop;

  return v_sent_count;
exception
  when others then
    raise notice 'notify_admins_security_alert failed: %', sqlerrm;
    return 0;
end;
$$;

revoke all on function public.notify_admins_security_alert(uuid, int) from public;
grant execute on function public.notify_admins_security_alert(uuid, int) to authenticated;

create or replace function public.process_security_event_alerts(
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.security_events%rowtype;
  v_rule public.security_alert_rules%rowtype;
  v_scope_key text;
  v_scope_user_id uuid;
  v_match_count int;
  v_alert_id uuid;
  v_last_notified_at timestamptz;
  v_muted_until timestamptz;
  v_now timestamptz := now();
  v_title text;
  v_message text;
begin
  if p_event_id is null then
    return;
  end if;

  select *
  into v_event
  from public.security_events se
  where se.id = p_event_id;

  if not found then
    return;
  end if;

  for v_rule in
    select r.*
    from public.security_alert_rules r
    where r.is_active = true
      and lower(r.event_type) = lower(v_event.event_type)
      and (r.source is null or lower(r.source) = lower(v_event.source))
  loop
    if v_rule.scope_type = 'global' then
      v_scope_key := 'global';
      v_scope_user_id := null;
    elsif v_rule.scope_type = 'actor_user' then
      v_scope_key := coalesce(v_event.actor_user_id::text, 'unknown');
      v_scope_user_id := v_event.actor_user_id;
    else
      v_scope_key := coalesce(v_event.target_user_id::text, v_event.actor_user_id::text, 'unknown');
      v_scope_user_id := coalesce(v_event.target_user_id, v_event.actor_user_id);
    end if;

    select count(*)
    into v_match_count
    from public.security_events se
    where lower(se.event_type) = lower(v_rule.event_type)
      and (v_rule.source is null or lower(se.source) = lower(v_rule.source))
      and se.created_at >= v_now - make_interval(mins => v_rule.window_minutes)
      and (
        case
          when v_rule.scope_type = 'global' then 'global'
          when v_rule.scope_type = 'actor_user' then coalesce(se.actor_user_id::text, 'unknown')
          else coalesce(se.target_user_id::text, se.actor_user_id::text, 'unknown')
        end
      ) = v_scope_key;

    if v_match_count < v_rule.threshold_count then
      continue;
    end if;

    v_title := format(
      '%s alarmi',
      replace(v_rule.event_type, '_', ' ')
    );

    v_message := format(
      '%s eventi %s dakika icinde %s kez goruldu.',
      v_rule.event_type,
      v_rule.window_minutes,
      v_match_count
    );

    select
      a.id,
      a.last_notified_at
    into
      v_alert_id,
      v_last_notified_at
    from public.security_alerts a
    where a.rule_id = v_rule.id
      and a.scope_key = v_scope_key
      and a.status in ('open', 'acknowledged')
    order by a.created_at desc
    limit 1
    for update;

    if v_alert_id is null then
      insert into public.security_alerts (
        rule_id,
        event_type,
        source,
        scope_type,
        scope_key,
        scope_user_id,
        severity,
        status,
        title,
        message,
        metadata,
        hit_count,
        first_hit_at,
        last_hit_at
      )
      values (
        v_rule.id,
        v_event.event_type,
        v_event.source,
        v_rule.scope_type,
        v_scope_key,
        v_scope_user_id,
        v_rule.severity,
        'open',
        v_title,
        v_message,
        jsonb_build_object(
          'windowMinutes', v_rule.window_minutes,
          'thresholdCount', v_rule.threshold_count,
          'matchCount', v_match_count,
          'source', v_event.source,
          'triggerEventId', v_event.id,
          'lastTriggerAt', v_now
        ),
        v_match_count,
        v_now,
        v_now
      )
      returning id, last_notified_at into v_alert_id, v_last_notified_at;
    else
      update public.security_alerts a
      set
        severity = v_rule.severity,
        title = v_title,
        message = v_message,
        metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
          'windowMinutes', v_rule.window_minutes,
          'thresholdCount', v_rule.threshold_count,
          'matchCount', v_match_count,
          'source', v_event.source,
          'triggerEventId', v_event.id,
          'lastTriggerAt', v_now
        ),
        hit_count = v_match_count,
        last_hit_at = v_now,
        updated_at = v_now
      where a.id = v_alert_id
      returning a.last_notified_at into v_last_notified_at;
    end if;

    select m.muted_until
    into v_muted_until
    from public.security_alert_mutes m
    where lower(m.event_type) = lower(v_rule.event_type)
      and coalesce(lower(m.source), '') = coalesce(lower(v_rule.source), '')
      and m.muted_until > v_now
    order by m.muted_until desc
    limit 1;

    if found then
      update public.security_alerts a
      set
        metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object('mutedUntil', v_muted_until),
        updated_at = v_now
      where a.id = v_alert_id;
      continue;
    end if;

    if v_last_notified_at is null
      or v_last_notified_at <= v_now - make_interval(mins => v_rule.dedupe_minutes)
    then
      perform public.notify_admins_security_alert(v_alert_id, v_rule.dedupe_minutes);
      update public.security_alerts a
      set
        last_notified_at = v_now,
        updated_at = v_now
      where a.id = v_alert_id;
    end if;
  end loop;
exception
  when others then
    raise notice 'process_security_event_alerts failed: %', sqlerrm;
end;
$$;

revoke all on function public.process_security_event_alerts(uuid) from public;
grant execute on function public.process_security_event_alerts(uuid) to authenticated;

create or replace function public.trg_security_event_after_insert_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.process_security_event_alerts(new.id);
  return new;
exception
  when others then
    raise notice 'trg_security_event_after_insert_alerts failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_security_event_after_insert_alerts on public.security_events;
create trigger trg_security_event_after_insert_alerts
after insert on public.security_events
for each row
execute function public.trg_security_event_after_insert_alerts();

-- --------------------------------------------
-- Admin RPCs
-- --------------------------------------------
create or replace function public.list_security_alert_rules()
returns table (
  id uuid,
  event_type text,
  source text,
  scope_type text,
  window_minutes int,
  threshold_count int,
  dedupe_minutes int,
  severity text,
  is_active boolean,
  active_mute_until timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  return query
  select
    r.id,
    r.event_type,
    r.source,
    r.scope_type,
    r.window_minutes,
    r.threshold_count,
    r.dedupe_minutes,
    r.severity,
    r.is_active,
    (
      select m.muted_until
      from public.security_alert_mutes m
      where lower(m.event_type) = lower(r.event_type)
        and coalesce(lower(m.source), '') = coalesce(lower(r.source), '')
        and m.muted_until > now()
      order by m.muted_until desc
      limit 1
    ) as active_mute_until,
    r.updated_at
  from public.security_alert_rules r
  order by lower(r.event_type), coalesce(lower(r.source), ''), r.scope_type;
end;
$$;

revoke all on function public.list_security_alert_rules() from public;
grant execute on function public.list_security_alert_rules() to authenticated;

create or replace function public.update_security_alert_rule(
  p_rule_id uuid,
  p_window_minutes int default null,
  p_threshold_count int default null,
  p_dedupe_minutes int default null,
  p_severity text default null,
  p_is_active boolean default null
)
returns table (
  id uuid,
  event_type text,
  source text,
  scope_type text,
  window_minutes int,
  threshold_count int,
  dedupe_minutes int,
  severity text,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_severity text := nullif(lower(trim(coalesce(p_severity, ''))), '');
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if p_rule_id is null then
    raise exception 'Rule secimi zorunlu.';
  end if;

  if p_window_minutes is not null and (p_window_minutes < 1 or p_window_minutes > 24 * 60) then
    raise exception 'window_minutes gecersiz.';
  end if;

  if p_threshold_count is not null and (p_threshold_count < 1 or p_threshold_count > 1000) then
    raise exception 'threshold_count gecersiz.';
  end if;

  if p_dedupe_minutes is not null and (p_dedupe_minutes < 1 or p_dedupe_minutes > 24 * 60) then
    raise exception 'dedupe_minutes gecersiz.';
  end if;

  if v_severity is not null and v_severity not in ('low', 'medium', 'high', 'critical') then
    raise exception 'severity gecersiz.';
  end if;

  update public.security_alert_rules r
  set
    window_minutes = coalesce(p_window_minutes, r.window_minutes),
    threshold_count = coalesce(p_threshold_count, r.threshold_count),
    dedupe_minutes = coalesce(p_dedupe_minutes, r.dedupe_minutes),
    severity = coalesce(v_severity, r.severity),
    is_active = coalesce(p_is_active, r.is_active),
    updated_by = v_actor_id,
    updated_at = now()
  where r.id = p_rule_id;

  if not found then
    raise exception 'Rule bulunamadi.';
  end if;

  begin
    perform public.create_admin_audit_log(
      'security.alert_rule.update',
      'security_alert_rule',
      p_rule_id::text,
      'Security alert rule guncellendi.',
      jsonb_build_object(
        'windowMinutes', p_window_minutes,
        'thresholdCount', p_threshold_count,
        'dedupeMinutes', p_dedupe_minutes,
        'severity', v_severity,
        'isActive', p_is_active
      )
    );
  exception
    when others then
      null;
  end;

  return query
  select
    r.id,
    r.event_type,
    r.source,
    r.scope_type,
    r.window_minutes,
    r.threshold_count,
    r.dedupe_minutes,
    r.severity,
    r.is_active,
    r.updated_at
  from public.security_alert_rules r
  where r.id = p_rule_id;
end;
$$;

revoke all on function public.update_security_alert_rule(uuid, int, int, int, text, boolean) from public;
grant execute on function public.update_security_alert_rule(uuid, int, int, int, text, boolean) to authenticated;

create or replace function public.list_security_alert_mutes()
returns table (
  id uuid,
  event_type text,
  source text,
  muted_until timestamptz,
  reason text,
  muted_by uuid,
  muted_by_username text,
  remaining_seconds bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  return query
  select
    m.id,
    m.event_type,
    m.source,
    m.muted_until,
    m.reason,
    m.muted_by,
    u.username as muted_by_username,
    greatest(0, floor(extract(epoch from (m.muted_until - now()))))::bigint as remaining_seconds
  from public.security_alert_mutes m
  left join public.users u on u.id = m.muted_by
  where m.muted_until > now()
  order by m.muted_until desc, lower(m.event_type);
end;
$$;

revoke all on function public.list_security_alert_mutes() from public;
grant execute on function public.list_security_alert_mutes() to authenticated;

create or replace function public.set_security_alert_mute(
  p_event_type text,
  p_source text default null,
  p_duration_minutes int default 60,
  p_reason text default null
)
returns table (
  id uuid,
  event_type text,
  source text,
  muted_until timestamptz,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_source text := nullif(lower(trim(coalesce(p_source, ''))), '');
  v_duration int := coalesce(p_duration_minutes, 60);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_until timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if v_event_type = '' then
    raise exception 'event_type bos olamaz.';
  end if;

  if v_duration not in (15, 60, 24 * 60) then
    raise exception 'Sadece 15, 60 veya 1440 dakika secilebilir.';
  end if;

  v_until := now() + make_interval(mins => v_duration);

  update public.security_alert_mutes m
  set
    muted_until = v_until,
    reason = left(v_reason, 500),
    muted_by = v_actor_id,
    updated_at = now()
  where lower(m.event_type) = v_event_type
    and coalesce(lower(m.source), '') = coalesce(v_source, '');

  if not found then
    insert into public.security_alert_mutes (
      event_type,
      source,
      muted_until,
      reason,
      muted_by
    )
    values (
      v_event_type,
      v_source,
      v_until,
      left(v_reason, 500),
      v_actor_id
    );
  end if;

  begin
    perform public.create_admin_audit_log(
      'security.alert_mute.set',
      'security_alert_mute',
      v_event_type || ':' || coalesce(v_source, '*'),
      'Security alarm mute guncellendi.',
      jsonb_build_object(
        'eventType', v_event_type,
        'source', v_source,
        'durationMinutes', v_duration,
        'mutedUntil', v_until
      )
    );
  exception
    when others then
      null;
  end;

  return query
  select
    m.id,
    m.event_type,
    m.source,
    m.muted_until,
    m.reason
  from public.security_alert_mutes m
  where lower(m.event_type) = v_event_type
    and coalesce(lower(m.source), '') = coalesce(v_source, '')
  limit 1;
end;
$$;

revoke all on function public.set_security_alert_mute(text, text, int, text) from public;
grant execute on function public.set_security_alert_mute(text, text, int, text) to authenticated;

create or replace function public.clear_security_alert_mute(
  p_event_type text,
  p_source text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_source text := nullif(lower(trim(coalesce(p_source, ''))), '');
  v_deleted int := 0;
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if v_event_type = '' then
    raise exception 'event_type bos olamaz.';
  end if;

  delete from public.security_alert_mutes m
  where lower(m.event_type) = v_event_type
    and coalesce(lower(m.source), '') = coalesce(v_source, '');

  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    begin
      perform public.create_admin_audit_log(
        'security.alert_mute.clear',
        'security_alert_mute',
        v_event_type || ':' || coalesce(v_source, '*'),
        'Security alarm mute kaldirildi.',
        jsonb_build_object(
          'eventType', v_event_type,
          'source', v_source
        )
      );
    exception
      when others then
        null;
    end;
  end if;

  return v_deleted > 0;
end;
$$;

revoke all on function public.clear_security_alert_mute(text, text) from public;
grant execute on function public.clear_security_alert_mute(text, text) to authenticated;

create or replace function public.list_security_alerts(
  p_status text default 'all',
  p_limit int default 120,
  p_search text default null
)
returns table (
  id uuid,
  rule_id uuid,
  event_type text,
  source text,
  scope_type text,
  scope_key text,
  scope_user_id uuid,
  severity text,
  status text,
  title text,
  message text,
  metadata jsonb,
  hit_count int,
  first_hit_at timestamptz,
  last_hit_at timestamptz,
  last_notified_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  acknowledged_by_username text,
  resolved_at timestamptz,
  resolved_by uuid,
  resolved_by_username text,
  muted_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, 'all')));
  v_limit int := greatest(1, least(coalesce(p_limit, 120), 500));
  v_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if v_status not in ('all', 'open', 'acknowledged', 'resolved') then
    raise exception 'status gecersiz.';
  end if;

  return query
  select
    a.id,
    a.rule_id,
    a.event_type,
    a.source,
    a.scope_type,
    a.scope_key,
    a.scope_user_id,
    a.severity,
    a.status,
    a.title,
    a.message,
    a.metadata,
    a.hit_count,
    a.first_hit_at,
    a.last_hit_at,
    a.last_notified_at,
    a.acknowledged_at,
    a.acknowledged_by,
    ack_user.username as acknowledged_by_username,
    a.resolved_at,
    a.resolved_by,
    resolved_user.username as resolved_by_username,
    (
      select m.muted_until
      from public.security_alert_mutes m
      where lower(m.event_type) = lower(a.event_type)
        and coalesce(lower(m.source), '') = coalesce(lower(a.source), '')
        and m.muted_until > now()
      order by m.muted_until desc
      limit 1
    ) as muted_until,
    a.created_at,
    a.updated_at
  from public.security_alerts a
  left join public.users ack_user on ack_user.id = a.acknowledged_by
  left join public.users resolved_user on resolved_user.id = a.resolved_by
  where
    (v_status = 'all' or a.status = v_status)
    and (
      v_search is null
      or lower(a.event_type) like '%' || v_search || '%'
      or lower(coalesce(a.source, '')) like '%' || v_search || '%'
      or lower(a.scope_key) like '%' || v_search || '%'
      or lower(a.title) like '%' || v_search || '%'
      or lower(a.message) like '%' || v_search || '%'
      or lower(coalesce(a.metadata::text, '')) like '%' || v_search || '%'
    )
  order by
    case a.status
      when 'open' then 0
      when 'acknowledged' then 1
      else 2
    end,
    a.last_hit_at desc
  limit v_limit;
end;
$$;

revoke all on function public.list_security_alerts(text, int, text) from public;
grant execute on function public.list_security_alerts(text, int, text) to authenticated;

create or replace function public.set_security_alert_status(
  p_alert_id uuid,
  p_status text,
  p_note text default null
)
returns table (
  id uuid,
  status text,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_status text := lower(trim(coalesce(p_status, '')));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if p_alert_id is null then
    raise exception 'Alert secimi zorunlu.';
  end if;

  if v_status not in ('open', 'acknowledged', 'resolved') then
    raise exception 'status gecersiz.';
  end if;

  update public.security_alerts a
  set
    status = v_status,
    acknowledged_at = case when v_status = 'acknowledged' then now() when v_status = 'open' then null else a.acknowledged_at end,
    acknowledged_by = case when v_status = 'acknowledged' then v_actor_id when v_status = 'open' then null else a.acknowledged_by end,
    resolved_at = case when v_status = 'resolved' then now() when v_status = 'open' then null else a.resolved_at end,
    resolved_by = case when v_status = 'resolved' then v_actor_id when v_status = 'open' then null else a.resolved_by end,
    metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
      'statusUpdatedAt', now(),
      'statusUpdatedBy', v_actor_id,
      'statusNote', left(v_note, 500)
    ),
    updated_at = now()
  where a.id = p_alert_id;

  if not found then
    raise exception 'Alert bulunamadi.';
  end if;

  begin
    perform public.create_admin_audit_log(
      'security.alert.status',
      'security_alert',
      p_alert_id::text,
      format('Security alert status degisti: %s', v_status),
      jsonb_build_object(
        'status', v_status,
        'note', left(v_note, 500)
      )
    );
  exception
    when others then
      null;
  end;

  return query
  select
    a.id,
    a.status,
    a.acknowledged_at,
    a.acknowledged_by,
    a.resolved_at,
    a.resolved_by,
    a.updated_at
  from public.security_alerts a
  where a.id = p_alert_id;
end;
$$;

revoke all on function public.set_security_alert_status(uuid, text, text) from public;
grant execute on function public.set_security_alert_status(uuid, text, text) to authenticated;

-- --------------------------------------------
-- Seed default rules
-- --------------------------------------------
insert into public.security_alert_rules (
  event_type,
  source,
  scope_type,
  window_minutes,
  threshold_count,
  dedupe_minutes,
  severity,
  is_active
)
values
  ('redeem_velocity_high', 'redeem', 'target_user', 10, 1, 15, 'high', true),
  ('redeem_velocity_critical', 'redeem', 'target_user', 10, 1, 15, 'critical', true),
  ('redeem_failure_burst', 'redeem', 'target_user', 10, 1, 20, 'high', true),
  ('user_banned', 'admin', 'target_user', 60, 1, 30, 'high', true)
on conflict (lower(event_type), coalesce(lower(source), ''), scope_type) do update
set
  window_minutes = excluded.window_minutes,
  threshold_count = excluded.threshold_count,
  dedupe_minutes = excluded.dedupe_minutes,
  severity = excluded.severity,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values
  ('security.alert_center', 'Guvenlik Alarm Merkezi', 'Alert rule + mute + state akislarini kontrol eder.', true, 100, false, '{}'::jsonb)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  metadata = coalesce(public.feature_flags.metadata, '{}'::jsonb) || excluded.metadata;

commit;
