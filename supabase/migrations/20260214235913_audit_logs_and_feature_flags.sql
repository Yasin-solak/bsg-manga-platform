-- ============================================
-- MangaZone | Audit Logs + Feature Flags
-- Date: 2026-02-14
-- ============================================

begin;

-- =========================================================
-- Audit logs
-- =========================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role text not null default 'system'
    check (actor_role in ('admin', 'moderator', 'user', 'system', 'anon')),
  action text not null
    check (char_length(action) between 2 and 120),
  resource_type text not null
    check (char_length(resource_type) between 2 and 80),
  resource_id text,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);
create index if not exists audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);
create index if not exists audit_logs_action_idx on public.audit_logs (action);
create index if not exists audit_logs_metadata_gin_idx on public.audit_logs using gin (metadata);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
  on public.audit_logs
  for select
  using (public.is_admin());

drop policy if exists audit_logs_insert_admin on public.audit_logs;
create policy audit_logs_insert_admin
  on public.audit_logs
  for insert
  with check (public.is_admin());

grant select, insert on public.audit_logs to authenticated;

create or replace function public.create_admin_audit_log(
  p_action text,
  p_resource_type text,
  p_resource_id text default null,
  p_summary text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_log_id uuid;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  select u.role
  into v_actor_role
  from public.users u
  where u.id = v_actor_id
  limit 1;

  insert into public.audit_logs (
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    summary,
    metadata
  )
  values (
    v_actor_id,
    coalesce(v_actor_role, 'admin'),
    trim(p_action),
    trim(p_resource_type),
    nullif(trim(coalesce(p_resource_id, '')), ''),
    left(coalesce(trim(p_summary), ''), 500),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.create_admin_audit_log(text, text, text, text, jsonb) to authenticated;

-- =========================================================
-- Feature flags
-- =========================================================
create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique
    check (
      key = lower(key)
      and key ~ '^[a-z0-9][a-z0-9._:-]{1,63}$'
    ),
  label text not null
    check (char_length(label) between 2 and 80),
  description text not null default '',
  is_enabled boolean not null default false,
  rollout_percent integer not null default 100
    check (rollout_percent between 0 and 100),
  is_public boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_flags_is_enabled_idx on public.feature_flags (is_enabled);
create index if not exists feature_flags_is_public_idx on public.feature_flags (is_public);
create index if not exists feature_flags_updated_at_idx on public.feature_flags (updated_at desc);

drop trigger if exists trg_feature_flags_updated_at on public.feature_flags;
create trigger trg_feature_flags_updated_at
  before update on public.feature_flags
  for each row
  execute function public.set_updated_at();

create or replace function public.set_feature_flag_updated_by()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is not null then
    new.updated_by := v_actor_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_feature_flags_updated_by on public.feature_flags;
create trigger trg_feature_flags_updated_by
  before insert or update on public.feature_flags
  for each row
  execute function public.set_feature_flag_updated_by();

alter table public.feature_flags enable row level security;

drop policy if exists feature_flags_select_rule on public.feature_flags;
create policy feature_flags_select_rule
  on public.feature_flags
  for select
  using (public.is_admin() or is_public = true);

drop policy if exists feature_flags_admin_write on public.feature_flags;
create policy feature_flags_admin_write
  on public.feature_flags
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.feature_flags to anon, authenticated;
grant insert, update, delete on public.feature_flags to authenticated;

create or replace function public.is_feature_enabled(
  p_key text,
  p_default boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_rollout integer;
  v_hash_input text;
  v_bucket integer;
begin
  select ff.is_enabled, ff.rollout_percent
  into v_enabled, v_rollout
  from public.feature_flags ff
  where ff.key = lower(trim(coalesce(p_key, '')))
    and (ff.is_public = true or public.is_admin())
  limit 1;

  if not found then
    return p_default;
  end if;

  if v_enabled is not true then
    return false;
  end if;

  if coalesce(v_rollout, 0) >= 100 then
    return true;
  end if;

  if coalesce(v_rollout, 0) <= 0 then
    return false;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  v_hash_input := auth.uid()::text || ':' || lower(trim(coalesce(p_key, '')));
  v_bucket := (abs(('x' || substr(md5(v_hash_input), 1, 8))::bit(32)::bigint) % 100)::integer;
  return v_bucket < v_rollout;
end;
$$;

grant execute on function public.is_feature_enabled(text, boolean) to anon, authenticated;

create or replace function public.set_feature_flag(
  p_key text,
  p_label text,
  p_description text default '',
  p_is_enabled boolean default false,
  p_rollout_percent integer default 100,
  p_is_public boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  key text,
  label text,
  description text,
  is_enabled boolean,
  rollout_percent integer,
  is_public boolean,
  metadata jsonb,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_key text;
  v_row public.feature_flags%rowtype;
begin
  v_actor_id := public.current_public_user_id();
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  v_key := lower(trim(coalesce(p_key, '')));
  if v_key = '' then
    raise exception 'Feature flag anahtari bos olamaz.';
  end if;

  insert into public.feature_flags (
    key,
    label,
    description,
    is_enabled,
    rollout_percent,
    is_public,
    metadata,
    updated_by
  )
  values (
    v_key,
    trim(coalesce(p_label, '')),
    coalesce(trim(p_description), ''),
    coalesce(p_is_enabled, false),
    least(100, greatest(0, coalesce(p_rollout_percent, 0))),
    coalesce(p_is_public, false),
    coalesce(p_metadata, '{}'::jsonb),
    v_actor_id
  )
  on conflict (key) do update
    set label = excluded.label,
        description = excluded.description,
        is_enabled = excluded.is_enabled,
        rollout_percent = excluded.rollout_percent,
        is_public = excluded.is_public,
        metadata = excluded.metadata,
        updated_by = v_actor_id
  returning * into v_row;

  perform public.create_admin_audit_log(
    'feature_flag.upsert',
    'feature_flag',
    v_row.id::text,
    format(
      '%s => %s (rollout=%s%%, public=%s)',
      v_row.key,
      case when v_row.is_enabled then 'on' else 'off' end,
      v_row.rollout_percent,
      case when v_row.is_public then 'yes' else 'no' end
    ),
    jsonb_build_object(
      'key', v_row.key,
      'label', v_row.label,
      'is_enabled', v_row.is_enabled,
      'rollout_percent', v_row.rollout_percent,
      'is_public', v_row.is_public
    )
  );

  return query
  select
    v_row.id,
    v_row.key,
    v_row.label,
    v_row.description,
    v_row.is_enabled,
    v_row.rollout_percent,
    v_row.is_public,
    v_row.metadata,
    v_row.updated_by,
    v_row.created_at,
    v_row.updated_at;
end;
$$;

grant execute on function public.set_feature_flag(text, text, text, boolean, integer, boolean, jsonb) to authenticated;

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
  ('admin.operations_center', 'Admin Operasyon Merkezi', 'Admin panel operasyon sekmesini ac/kapat.', true, 100, false, '{}'::jsonb),
  ('economy.coin_codes', 'Coin Kod Aktivasyonu', 'Coin kodu aktivasyon akisini ac/kapat.', true, 100, true, '{}'::jsonb),
  ('economy.fansub_wallet_purchase', 'Fansub Kasasi Satin Alimi', 'Fansub kasasi ile urun satin alma akisini ac/kapat.', true, 100, true, '{}'::jsonb),
  ('notifications.center', 'Bildirim Merkezi', 'Navbar bildirim merkezi gorunurlugu.', true, 100, true, '{}'::jsonb),
  ('rewards.user_tasks', 'Kullanici Gorev Sistemi', 'Kullanici gorev paneli ve claim akislarini ac/kapat.', true, 100, true, '{}'::jsonb)
on conflict (key) do nothing;

commit;
