-- ============================================
-- BSG Manga | Security Ops Phase 5/6
-- Automatic Actions + Incident Timeline + Jobs
-- Date: 2026-02-15
-- ============================================

begin;

-- --------------------------------------------
-- Incident timeline
-- --------------------------------------------
create table if not exists public.security_alert_timeline (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.security_alerts(id) on delete cascade,
  event_type text not null check (length(trim(event_type)) > 0),
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists security_alert_timeline_alert_id_idx
  on public.security_alert_timeline (alert_id, created_at desc);

create index if not exists security_alert_timeline_event_type_idx
  on public.security_alert_timeline (event_type);

-- --------------------------------------------
-- Action rules (alert -> action mapping)
-- --------------------------------------------
create table if not exists public.security_alert_action_rules (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(trim(event_type)) > 0),
  source text,
  min_severity text not null default 'high'
    check (min_severity in ('low', 'medium', 'high', 'critical')),
  action_type text not null
    check (action_type in ('redeem_lock_15m', 'redeem_lock_60m', 'redeem_lock_24h')),
  requires_approval boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists security_alert_action_rules_unique_idx
  on public.security_alert_action_rules (lower(event_type), coalesce(lower(source), ''), action_type);

create index if not exists security_alert_action_rules_active_idx
  on public.security_alert_action_rules (is_active, event_type);

drop trigger if exists trg_set_updated_at_security_alert_action_rules on public.security_alert_action_rules;
create trigger trg_set_updated_at_security_alert_action_rules
before update on public.security_alert_action_rules
for each row execute function public.set_updated_at();

-- --------------------------------------------
-- Action queue/state
-- --------------------------------------------
create table if not exists public.security_alert_actions (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.security_alerts(id) on delete cascade,
  rule_id uuid references public.security_alert_action_rules(id) on delete set null,
  action_type text not null
    check (action_type in ('redeem_lock_15m', 'redeem_lock_60m', 'redeem_lock_24h')),
  target_user_id uuid references public.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'rejected', 'failed')),
  requires_approval boolean not null default true,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  applied_by uuid references public.users(id) on delete set null,
  rejected_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  rejected_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists security_alert_actions_unique_alert_rule_idx
  on public.security_alert_actions (alert_id, rule_id)
  where rule_id is not null;

create index if not exists security_alert_actions_status_created_idx
  on public.security_alert_actions (status, created_at desc);

create index if not exists security_alert_actions_target_user_idx
  on public.security_alert_actions (target_user_id);

drop trigger if exists trg_set_updated_at_security_alert_actions on public.security_alert_actions;
create trigger trg_set_updated_at_security_alert_actions
before update on public.security_alert_actions
for each row execute function public.set_updated_at();

-- --------------------------------------------
-- Redeem lock table
-- --------------------------------------------
create table if not exists public.security_redeem_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  locked_until timestamptz not null,
  reason text,
  source_alert_id uuid references public.security_alerts(id) on delete set null,
  source_action_id uuid references public.security_alert_actions(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists security_redeem_locks_until_idx
  on public.security_redeem_locks (locked_until desc);

create index if not exists security_redeem_locks_alert_idx
  on public.security_redeem_locks (source_alert_id);

drop trigger if exists trg_set_updated_at_security_redeem_locks on public.security_redeem_locks;
create trigger trg_set_updated_at_security_redeem_locks
before update on public.security_redeem_locks
for each row execute function public.set_updated_at();

-- --------------------------------------------
-- Archives + maintenance runs
-- --------------------------------------------
create table if not exists public.security_alert_archives (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now()
);

create index if not exists security_alert_archives_alert_id_idx
  on public.security_alert_archives (alert_id);

create index if not exists security_alert_archives_archived_at_idx
  on public.security_alert_archives (archived_at desc);

create table if not exists public.security_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  initiated_by uuid references public.users(id) on delete set null,
  mode text not null default 'manual'
    check (mode in ('manual', 'scheduled')),
  cleaned_mutes int not null default 0,
  released_redeem_locks int not null default 0,
  auto_resolved_alerts int not null default 0,
  archived_alerts int not null default 0,
  generated_summary_event_id uuid references public.security_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'success'
    check (status in ('success', 'failed')),
  error_message text
);

create index if not exists security_maintenance_runs_started_idx
  on public.security_maintenance_runs (started_at desc);

create index if not exists security_maintenance_runs_status_idx
  on public.security_maintenance_runs (status);

-- --------------------------------------------
-- RLS
-- --------------------------------------------
alter table public.security_alert_timeline enable row level security;
alter table public.security_alert_action_rules enable row level security;
alter table public.security_alert_actions enable row level security;
alter table public.security_redeem_locks enable row level security;
alter table public.security_alert_archives enable row level security;
alter table public.security_maintenance_runs enable row level security;

drop policy if exists security_alert_timeline_admin_all on public.security_alert_timeline;
create policy security_alert_timeline_admin_all
  on public.security_alert_timeline
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists security_alert_action_rules_admin_all on public.security_alert_action_rules;
create policy security_alert_action_rules_admin_all
  on public.security_alert_action_rules
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists security_alert_actions_admin_all on public.security_alert_actions;
create policy security_alert_actions_admin_all
  on public.security_alert_actions
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists security_redeem_locks_admin_all on public.security_redeem_locks;
create policy security_redeem_locks_admin_all
  on public.security_redeem_locks
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists security_alert_archives_admin_all on public.security_alert_archives;
create policy security_alert_archives_admin_all
  on public.security_alert_archives
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists security_maintenance_runs_admin_all on public.security_maintenance_runs;
create policy security_maintenance_runs_admin_all
  on public.security_maintenance_runs
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.security_alert_timeline to authenticated;
grant select, insert, update, delete on public.security_alert_action_rules to authenticated;
grant select, insert, update, delete on public.security_alert_actions to authenticated;
grant select, insert, update, delete on public.security_redeem_locks to authenticated;
grant select, insert, update, delete on public.security_alert_archives to authenticated;
grant select, insert, update, delete on public.security_maintenance_runs to authenticated;

-- --------------------------------------------
-- Helpers
-- --------------------------------------------
create or replace function public.security_severity_rank(
  p_severity text
)
returns int
language sql
immutable
as $$
  select case lower(coalesce(trim(p_severity), ''))
    when 'low' then 1
    when 'medium' then 2
    when 'high' then 3
    when 'critical' then 4
    else 0
  end;
$$;

create or replace function public.add_security_alert_timeline(
  p_alert_id uuid,
  p_event_type text,
  p_message text default '',
  p_metadata jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_timeline_id uuid;
begin
  if p_alert_id is null then
    return null;
  end if;

  if v_event_type = '' then
    v_event_type := 'note';
  end if;

  insert into public.security_alert_timeline (
    alert_id,
    event_type,
    message,
    metadata,
    actor_user_id
  )
  values (
    p_alert_id,
    v_event_type,
    left(coalesce(p_message, ''), 500),
    coalesce(p_metadata, '{}'::jsonb),
    p_actor_user_id
  )
  returning id into v_timeline_id;

  return v_timeline_id;
exception
  when others then
    raise notice 'add_security_alert_timeline failed: %', sqlerrm;
    return null;
end;
$$;

revoke all on function public.add_security_alert_timeline(uuid, text, text, jsonb, uuid) from public;
grant execute on function public.add_security_alert_timeline(uuid, text, text, jsonb, uuid) to authenticated;

create or replace function public.upsert_security_redeem_lock(
  p_user_id uuid,
  p_locked_until timestamptz,
  p_reason text default null,
  p_source_alert_id uuid default null,
  p_source_action_id uuid default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if p_locked_until is null or p_locked_until <= now() then
    return null;
  end if;

  update public.security_redeem_locks rl
  set
    locked_until = greatest(rl.locked_until, p_locked_until),
    reason = coalesce(left(nullif(trim(coalesce(p_reason, '')), ''), 500), rl.reason),
    source_alert_id = coalesce(p_source_alert_id, rl.source_alert_id),
    source_action_id = coalesce(p_source_action_id, rl.source_action_id),
    created_by = coalesce(p_created_by, rl.created_by),
    updated_at = now()
  where rl.user_id = p_user_id
  returning rl.id into v_id;

  if v_id is null then
    insert into public.security_redeem_locks (
      user_id,
      locked_until,
      reason,
      source_alert_id,
      source_action_id,
      created_by
    )
    values (
      p_user_id,
      p_locked_until,
      left(nullif(trim(coalesce(p_reason, '')), ''), 500),
      p_source_alert_id,
      p_source_action_id,
      p_created_by
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_security_redeem_lock(uuid, timestamptz, text, uuid, uuid, uuid) from public;
grant execute on function public.upsert_security_redeem_lock(uuid, timestamptz, text, uuid, uuid, uuid) to authenticated;

create or replace function public.execute_security_alert_action_internal(
  p_action_id uuid,
  p_actor_user_id uuid default null
)
returns table (
  status text,
  detail text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.security_alert_actions%rowtype;
  v_until timestamptz;
begin
  if p_action_id is null then
    raise exception 'Action secimi zorunlu.';
  end if;

  select *
  into v_action
  from public.security_alert_actions a
  where a.id = p_action_id
  for update;

  if not found then
    raise exception 'Action bulunamadi.';
  end if;

  if v_action.status in ('applied', 'rejected') then
    return query select v_action.status, 'Action zaten tamamlanmis.';
    return;
  end if;

  if v_action.target_user_id is null then
    update public.security_alert_actions
    set
      status = 'failed',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('error', 'Hedef kullanici eksik'),
      updated_at = now()
    where id = p_action_id;

    perform public.add_security_alert_timeline(
      v_action.alert_id,
      'action_failed',
      'Action hedef kullanici eksigi nedeniyle basarisiz oldu.',
      jsonb_build_object('actionId', v_action.id, 'actionType', v_action.action_type),
      p_actor_user_id
    );

    return query select 'failed'::text, 'Hedef kullanici eksik.'::text;
    return;
  end if;

  if v_action.action_type = 'redeem_lock_15m' then
    v_until := now() + interval '15 minutes';
  elsif v_action.action_type = 'redeem_lock_60m' then
    v_until := now() + interval '60 minutes';
  elsif v_action.action_type = 'redeem_lock_24h' then
    v_until := now() + interval '24 hours';
  else
    raise exception 'Desteklenmeyen action_type: %', v_action.action_type;
  end if;

  perform public.upsert_security_redeem_lock(
    v_action.target_user_id,
    v_until,
    coalesce(v_action.reason, format('Security action (%s)', v_action.action_type)),
    v_action.alert_id,
    v_action.id,
    p_actor_user_id
  );

  update public.security_alert_actions
  set
    status = 'applied',
    applied_at = now(),
    applied_by = p_actor_user_id,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('appliedUntil', v_until),
    updated_at = now()
  where id = v_action.id;

  perform public.add_security_alert_timeline(
    v_action.alert_id,
    'action_applied',
    format('Action uygulandi: %s', v_action.action_type),
    jsonb_build_object(
      'actionId', v_action.id,
      'actionType', v_action.action_type,
      'targetUserId', v_action.target_user_id,
      'lockedUntil', v_until
    ),
    p_actor_user_id
  );

  return query select 'applied'::text, format('Action uygulandi (%s).', v_action.action_type)::text;
exception
  when others then
    update public.security_alert_actions
    set
      status = 'failed',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('error', left(coalesce(sqlerrm, 'Action error'), 500)),
      updated_at = now()
    where id = p_action_id;

    if found then
      perform public.add_security_alert_timeline(
        (select alert_id from public.security_alert_actions where id = p_action_id),
        'action_failed',
        left(coalesce(sqlerrm, 'Action error'), 500),
        jsonb_build_object('actionId', p_action_id),
        p_actor_user_id
      );
    end if;

    return query select 'failed'::text, left(coalesce(sqlerrm, 'Action error'), 500)::text;
end;
$$;

revoke all on function public.execute_security_alert_action_internal(uuid, uuid) from public;
grant execute on function public.execute_security_alert_action_internal(uuid, uuid) to authenticated;
