-- MangaZone | Server-controlled user XP and level engine
-- The legacy users.level field is kept for backward compatibility. The new progress model
-- uses versioned thresholds, an append-only event ledger and an atomic snapshot.

begin;

create table if not exists public.user_level_rulesets (
  version smallint primary key check (version > 0),
  name text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 80),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create unique index if not exists user_level_rulesets_one_active_idx
  on public.user_level_rulesets (is_active)
  where is_active = true;

create table if not exists public.user_level_thresholds (
  ruleset_version smallint not null
    references public.user_level_rulesets(version) on delete restrict,
  level_number smallint not null check (level_number > 0),
  title text not null check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 80),
  min_total_xp bigint not null check (min_total_xp >= 0),
  primary key (ruleset_version, level_number),
  unique (ruleset_version, min_total_xp)
);

create table if not exists app_private.user_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_key text not null unique
    check (pg_catalog.char_length(pg_catalog.btrim(event_key)) between 1 and 200),
  source_type text not null
    check (source_type in ('quest_claim', 'admin_adjustment', 'system_correction')),
  source_ref text,
  xp_delta integer not null check (xp_delta <> 0 and xp_delta between -1000000 and 1000000),
  reason_code text not null
    check (pg_catalog.char_length(pg_catalog.btrim(reason_code)) between 1 and 100),
  ruleset_version smallint not null
    references public.user_level_rulesets(version) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_xp_events_user_created_idx
  on app_private.user_xp_events (user_id, created_at desc, id desc);

create table if not exists public.user_level_snapshots (
  user_id uuid primary key references public.users(id) on delete cascade,
  ruleset_version smallint not null,
  total_xp bigint not null default 0 check (total_xp >= 0),
  level_number smallint not null,
  last_event_id uuid references app_private.user_xp_events(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (ruleset_version, level_number)
    references public.user_level_thresholds(ruleset_version, level_number)
    on delete restrict
);

create index if not exists user_level_snapshots_rank_idx
  on public.user_level_snapshots (ruleset_version, level_number desc, total_xp desc);

insert into public.user_level_rulesets (version, name, is_active, activated_at)
values (1, 'MangaZone Kullanici Seviyeleri V1', true, now())
on conflict (version) do update
set name = excluded.name,
    is_active = excluded.is_active,
    activated_at = coalesce(public.user_level_rulesets.activated_at, excluded.activated_at);

insert into public.user_level_thresholds (
  ruleset_version,
  level_number,
  title,
  min_total_xp
)
values
  (1, 1, 'Yeni Üye', 0),
  (1, 2, 'Manga Okuru', 100),
  (1, 3, 'Düzenli Okur', 300),
  (1, 4, 'Hevesli Okur', 700),
  (1, 5, 'Manga Kaşifi', 1500),
  (1, 6, 'Topluluk Sesi', 3000),
  (1, 7, 'Kıdemli Okur', 5500),
  (1, 8, 'Usta Okur', 9000),
  (1, 9, 'Efsane Okur', 14000),
  (1, 10, 'MangaZone Efsanesi', 22000)
on conflict (ruleset_version, level_number) do update
set title = excluded.title,
    min_total_xp = excluded.min_total_xp;

create or replace function app_private.prevent_user_xp_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'XP olay defteri değiştirilemez.';
end;
$function$;

drop trigger if exists trg_user_xp_events_append_only on app_private.user_xp_events;
create trigger trg_user_xp_events_append_only
  before update or delete on app_private.user_xp_events
  for each row
  execute function app_private.prevent_user_xp_event_mutation();

create or replace function app_private.award_user_xp(
  p_user_id uuid,
  p_event_key text,
  p_source_type text,
  p_source_ref text,
  p_xp_delta integer,
  p_reason_code text,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now(),
  p_notify boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ruleset_version smallint;
  v_previous_level smallint;
  v_level_number smallint;
  v_level_title text;
  v_total_xp bigint;
  v_applied_delta integer;
  v_event_id uuid;
  v_existing app_private.user_xp_events%rowtype;
  v_user public.users%rowtype;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Kullanıcı kimliği zorunludur.';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_event_key, '')), '') is null
     or pg_catalog.char_length(pg_catalog.btrim(p_event_key)) > 200 then
    raise exception using errcode = '22023', message = 'Geçerli bir XP olay anahtarı zorunludur.';
  end if;
  if p_source_type not in ('quest_claim', 'admin_adjustment', 'system_correction') then
    raise exception using errcode = '22023', message = 'Geçersiz XP kaynak türü.';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_reason_code, '')), '') is null
     or pg_catalog.char_length(pg_catalog.btrim(p_reason_code)) > 100 then
    raise exception using errcode = '22023', message = 'Geçerli bir XP neden kodu zorunludur.';
  end if;
  if coalesce(p_xp_delta, 0) = 0 or pg_catalog.abs(p_xp_delta::bigint) > 1000000 then
    raise exception using errcode = '22023', message = 'XP değişimi sıfır olamaz ve izin verilen aralığı aşamaz.';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'XP meta verisi JSON nesnesi olmalıdır.';
  end if;

  select e.*
  into v_existing
  from app_private.user_xp_events as e
  where e.event_key = pg_catalog.btrim(p_event_key)
  limit 1;

  if found then
    if v_existing.user_id <> p_user_id then
      raise exception using errcode = '23505', message = 'XP olay anahtarı başka bir kullanıcıya aittir.';
    end if;
    select s.total_xp, s.level_number, t.title
    into v_total_xp, v_level_number, v_level_title
    from public.user_level_snapshots as s
    join public.user_level_thresholds as t
      on t.ruleset_version = s.ruleset_version
     and t.level_number = s.level_number
    where s.user_id = p_user_id;
    return pg_catalog.jsonb_build_object(
      'eventId', v_existing.id,
      'applied', false,
      'xpDelta', v_existing.xp_delta,
      'totalXp', v_total_xp,
      'levelNumber', v_level_number,
      'title', v_level_title
    );
  end if;

  select u.*
  into v_user
  from public.users as u
  where u.id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Kullanıcı bulunamadı.';
  end if;

  if p_xp_delta > 0 and (
    not coalesce(v_user.is_active, true)
    or (
      coalesce(v_user.is_banned, false)
      and (v_user.ban_until is null or v_user.ban_until > now())
    )
  ) then
    return pg_catalog.jsonb_build_object('applied', false, 'reason', 'user_ineligible');
  end if;

  select r.version
  into v_ruleset_version
  from public.user_level_rulesets as r
  where r.is_active = true
  order by r.version desc
  limit 1;

  if v_ruleset_version is null then
    raise exception using errcode = '55000', message = 'Aktif kullanıcı seviye kural seti bulunamadı.';
  end if;

  insert into public.user_level_snapshots (
    user_id, ruleset_version, total_xp, level_number
  )
  values (p_user_id, v_ruleset_version, 0, 1)
  on conflict (user_id) do nothing;

  select s.total_xp, s.level_number
  into v_total_xp, v_previous_level
  from public.user_level_snapshots as s
  where s.user_id = p_user_id
  for update;

  v_applied_delta := case
    when p_xp_delta < 0 then greatest(p_xp_delta, -v_total_xp)::integer
    else p_xp_delta
  end;

  if v_applied_delta = 0 then
    select t.title into v_level_title
    from public.user_level_thresholds as t
    where t.ruleset_version = v_ruleset_version
      and t.level_number = v_previous_level;
    return pg_catalog.jsonb_build_object(
      'applied', false,
      'reason', 'no_effect',
      'totalXp', v_total_xp,
      'levelNumber', v_previous_level,
      'title', v_level_title
    );
  end if;

  v_total_xp := v_total_xp + v_applied_delta;

  select t.level_number, t.title
  into v_level_number, v_level_title
  from public.user_level_thresholds as t
  where t.ruleset_version = v_ruleset_version
    and t.min_total_xp <= v_total_xp
  order by t.min_total_xp desc
  limit 1;

  insert into app_private.user_xp_events (
    user_id,
    event_key,
    source_type,
    source_ref,
    xp_delta,
    reason_code,
    ruleset_version,
    actor_user_id,
    metadata,
    occurred_at
  )
  values (
    p_user_id,
    pg_catalog.btrim(p_event_key),
    p_source_type,
    nullif(pg_catalog.btrim(coalesce(p_source_ref, '')), ''),
    v_applied_delta,
    pg_catalog.btrim(p_reason_code),
    v_ruleset_version,
    p_actor_user_id,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_occurred_at, now())
  )
  returning id into v_event_id;

  update public.user_level_snapshots
  set ruleset_version = v_ruleset_version,
      total_xp = v_total_xp,
      level_number = v_level_number,
      last_event_id = v_event_id,
      updated_at = now()
  where user_id = p_user_id;

  if p_notify and v_level_number > v_previous_level then
    perform public.push_notification(
      p_user_id,
      'level_up',
      'Yeni seviyeye ulaştın',
      'Seviye ' || v_level_number::text || ' · ' || v_level_title,
      pg_catalog.jsonb_build_object(
        'event_key', 'user-level-up:' || v_event_id::text,
        'level_number', v_level_number,
        'level_title', v_level_title,
        'total_xp', v_total_xp
      ),
      'sparkles'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'eventId', v_event_id,
    'applied', true,
    'xpDelta', v_applied_delta,
    'totalXp', v_total_xp,
    'levelNumber', v_level_number,
    'title', v_level_title
  );
exception
  when unique_violation then
    select e.*
    into v_existing
    from app_private.user_xp_events as e
    where e.event_key = pg_catalog.btrim(p_event_key)
    limit 1;
    if found and v_existing.user_id = p_user_id then
      return pg_catalog.jsonb_build_object(
        'eventId', v_existing.id,
        'applied', false,
        'xpDelta', v_existing.xp_delta
      );
    end if;
    raise;
end;
$function$;

create or replace function app_private.create_user_level_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ruleset_version smallint;
  v_first_level smallint;
begin
  select r.version into v_ruleset_version
  from public.user_level_rulesets as r
  where r.is_active = true
  order by r.version desc
  limit 1;

  select t.level_number into v_first_level
  from public.user_level_thresholds as t
  where t.ruleset_version = v_ruleset_version
  order by t.min_total_xp asc
  limit 1;

  if v_ruleset_version is not null and v_first_level is not null then
    insert into public.user_level_snapshots (
      user_id, ruleset_version, total_xp, level_number
    )
    values (new.id, v_ruleset_version, 0, v_first_level)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_users_create_level_snapshot on public.users;
create trigger trg_users_create_level_snapshot
  after insert on public.users
  for each row
  execute function app_private.create_user_level_snapshot();

insert into public.user_level_snapshots (
  user_id, ruleset_version, total_xp, level_number
)
select u.id, 1, 0, 1
from public.users as u
on conflict (user_id) do nothing;

alter table public.user_level_rulesets enable row level security;
alter table public.user_level_thresholds enable row level security;
alter table public.user_level_snapshots enable row level security;

drop policy if exists user_level_rulesets_read on public.user_level_rulesets;
create policy user_level_rulesets_read
  on public.user_level_rulesets for select
  using (is_active = true or public.is_admin());

drop policy if exists user_level_thresholds_read on public.user_level_thresholds;
create policy user_level_thresholds_read
  on public.user_level_thresholds for select
  using (
    exists (
      select 1
      from public.user_level_rulesets as r
      where r.version = ruleset_version
        and (r.is_active = true or public.is_admin())
    )
  );

drop policy if exists user_level_snapshots_read_own_or_admin on public.user_level_snapshots;
create policy user_level_snapshots_read_own_or_admin
  on public.user_level_snapshots for select
  using (user_id = public.current_public_user_id() or public.is_admin());

revoke all on table public.user_level_rulesets from public, anon, authenticated;
revoke all on table public.user_level_thresholds from public, anon, authenticated;
revoke all on table public.user_level_snapshots from public, anon, authenticated;
grant select on table public.user_level_rulesets to anon, authenticated;
grant select on table public.user_level_thresholds to anon, authenticated;

revoke all on table app_private.user_xp_events from public, anon, authenticated;
revoke all on function app_private.prevent_user_xp_event_mutation()
  from public, anon, authenticated;
revoke all on function app_private.award_user_xp(
  uuid, text, text, text, integer, text, uuid, jsonb, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function app_private.award_user_xp(
  uuid, text, text, text, integer, text, uuid, jsonb, timestamptz, boolean
) to service_role;
revoke all on function app_private.create_user_level_snapshot()
  from public, anon, authenticated;

comment on table app_private.user_xp_events is
  'Sunucu tarafinda uretilen, UPDATE ve DELETE islemlerine kapali kullanici XP olay defteri.';
comment on table public.user_level_snapshots is
  'Kullanici ilerlemesinin olay defteriyle atomik tutulan guncel okuma modeli.';
comment on function app_private.award_user_xp(
  uuid, text, text, text, integer, text, uuid, jsonb, timestamptz, boolean
) is 'Idempotent olay anahtariyla XP uygular; istemci erisimine kapali sunucu siniridir.';

notify pgrst, 'reload schema';
commit;
