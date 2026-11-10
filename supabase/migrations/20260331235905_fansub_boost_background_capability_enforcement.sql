begin;

create or replace function public.resolve_store_asset_media_kind(
  p_asset_ref text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(trim(coalesce(p_asset_ref, '')), '') is null then null
    when lower(trim(p_asset_ref)) ~ '\.(mp4|webm)$' then 'video'
    when lower(trim(p_asset_ref)) ~ '\.(gif|jpe?g|png|webp)$' then 'image'
    else null
  end;
$$;

grant execute on function public.resolve_store_asset_media_kind(text) to anon, authenticated;

create or replace function public.cleanup_invalid_fansub_custom_background(
  p_fansub_id uuid,
  p_capabilities jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_ref text := null;
  v_capabilities jsonb := coalesce(p_capabilities, public.build_fansub_boost_capabilities(0));
  v_media_kind text := null;
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  select nullif(trim(coalesce(f.custom_background_asset_url, '')), '')
  into v_asset_ref
  from public.fansubs f
  where f.id = p_fansub_id
  limit 1;

  if v_asset_ref is null then
    return;
  end if;

  v_media_kind := public.resolve_store_asset_media_kind(v_asset_ref);

  if v_media_kind is null
    or position('store-assets://fansubs/' || p_fansub_id::text || '/backgrounds/slots/slot-' in v_asset_ref) <> 1
    or (v_media_kind = 'image' and coalesce((v_capabilities ->> 'canUploadStaticBackground')::boolean, false) = false)
    or (v_media_kind = 'video' and coalesce((v_capabilities ->> 'canUploadVideoBackground')::boolean, false) = false)
  then
    update public.fansubs
    set custom_background_asset_url = null
    where id = p_fansub_id
      and custom_background_asset_url is not null;
  end if;
end;
$$;

grant execute on function public.cleanup_invalid_fansub_custom_background(uuid, jsonb) to authenticated;

create or replace function public.refresh_fansub_boost_snapshot(
  p_fansub_id uuid
)
returns public.fansub_boost_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_power integer := 0;
  v_tier_level integer := 0;
  v_active_supporter_count integer := 0;
  v_active_grant_count integer := 0;
  v_active_monthly_supporter_count integer := 0;
  v_active_mega_supporter_count integer := 0;
  v_active_top_supporter_count integer := 0;
  v_last_grant_expires_at timestamptz := null;
  v_current_tier_floor_power integer := 0;
  v_next_tier_level integer := null;
  v_next_tier_required_power integer := null;
  v_next_tier_remaining_power integer := 0;
  v_tier_progress_percent numeric(5,2) := 0;
  v_capabilities jsonb := '{}'::jsonb;
  v_snapshot public.fansub_boost_snapshots%rowtype;
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  update public.fansub_boost_grants
  set status = 'expired'
  where fansub_id = p_fansub_id
    and status = 'active'
    and expires_at <= now();

  select
    coalesce(sum(g.boost_power), 0)::integer,
    count(*)::integer,
    count(distinct g.supporter_user_id)::integer,
    count(distinct g.supporter_user_id) filter (where g.plan_code = 'monthly')::integer,
    count(distinct g.supporter_user_id) filter (where g.plan_code = 'mega')::integer,
    count(distinct g.supporter_user_id) filter (where g.plan_code = 'top')::integer,
    max(g.expires_at)
  into
    v_active_power,
    v_active_grant_count,
    v_active_supporter_count,
    v_active_monthly_supporter_count,
    v_active_mega_supporter_count,
    v_active_top_supporter_count,
    v_last_grant_expires_at
  from public.fansub_boost_grants g
  where g.fansub_id = p_fansub_id
    and g.status = 'active'
    and g.expires_at > now();

  v_tier_level := public.resolve_fansub_boost_tier(v_active_power);
  v_current_tier_floor_power := public.get_fansub_boost_tier_floor_power(v_tier_level);
  v_next_tier_level := public.get_fansub_boost_next_tier_level(v_tier_level);
  v_next_tier_required_power := public.get_fansub_boost_next_tier_required_power(v_tier_level);
  v_capabilities := public.build_fansub_boost_capabilities(v_tier_level);

  if v_next_tier_required_power is null then
    v_next_tier_remaining_power := 0;
    v_tier_progress_percent := 100;
  else
    v_next_tier_remaining_power := greatest(v_next_tier_required_power - v_active_power, 0);
    if v_next_tier_required_power <= v_current_tier_floor_power then
      v_tier_progress_percent := 0;
    else
      v_tier_progress_percent := round(
        least(
          greatest(
            (
              (v_active_power - v_current_tier_floor_power)::numeric
              / (v_next_tier_required_power - v_current_tier_floor_power)::numeric
            ) * 100,
            0
          ),
          100
        ),
        2
      );
    end if;
  end if;

  insert into public.fansub_boost_snapshots (
    fansub_id,
    active_power,
    tier_level,
    active_supporter_count,
    active_grant_count,
    active_monthly_supporter_count,
    active_mega_supporter_count,
    active_top_supporter_count,
    capabilities,
    last_grant_expires_at,
    current_tier_floor_power,
    next_tier_level,
    next_tier_required_power,
    next_tier_remaining_power,
    tier_progress_percent
  )
  values (
    p_fansub_id,
    v_active_power,
    v_tier_level,
    v_active_supporter_count,
    v_active_grant_count,
    v_active_monthly_supporter_count,
    v_active_mega_supporter_count,
    v_active_top_supporter_count,
    v_capabilities,
    v_last_grant_expires_at,
    v_current_tier_floor_power,
    v_next_tier_level,
    v_next_tier_required_power,
    v_next_tier_remaining_power,
    v_tier_progress_percent
  )
  on conflict (fansub_id) do update
    set active_power = excluded.active_power,
        tier_level = excluded.tier_level,
        active_supporter_count = excluded.active_supporter_count,
        active_grant_count = excluded.active_grant_count,
        active_monthly_supporter_count = excluded.active_monthly_supporter_count,
        active_mega_supporter_count = excluded.active_mega_supporter_count,
        active_top_supporter_count = excluded.active_top_supporter_count,
        capabilities = excluded.capabilities,
        last_grant_expires_at = excluded.last_grant_expires_at,
        current_tier_floor_power = excluded.current_tier_floor_power,
        next_tier_level = excluded.next_tier_level,
        next_tier_required_power = excluded.next_tier_required_power,
        next_tier_remaining_power = excluded.next_tier_remaining_power,
        tier_progress_percent = excluded.tier_progress_percent
  returning *
  into v_snapshot;

  perform public.cleanup_invalid_fansub_custom_background(p_fansub_id, v_capabilities);

  return v_snapshot;
end;
$$;

grant execute on function public.refresh_fansub_boost_snapshot(uuid) to authenticated;

create or replace function public.maybe_refresh_fansub_boost_snapshot(
  p_fansub_id uuid
)
returns public.fansub_boost_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot public.fansub_boost_snapshots%rowtype;
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  select *
  into v_snapshot
  from public.fansub_boost_snapshots s
  where s.fansub_id = p_fansub_id
  limit 1;

  if not found then
    return public.refresh_fansub_boost_snapshot(p_fansub_id);
  end if;

  if v_snapshot.last_grant_expires_at is not null and v_snapshot.last_grant_expires_at <= now() then
    return public.refresh_fansub_boost_snapshot(p_fansub_id);
  end if;

  if coalesce(v_snapshot.updated_at, to_timestamp(0)) <= now() - interval '5 minutes' then
    return public.refresh_fansub_boost_snapshot(p_fansub_id);
  end if;

  return v_snapshot;
end;
$$;

grant execute on function public.maybe_refresh_fansub_boost_snapshot(uuid) to authenticated;

create or replace function public.assert_fansub_custom_background_access(
  p_fansub_id uuid,
  p_asset_ref text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_ref text := nullif(trim(coalesce(p_asset_ref, '')), '');
  v_media_kind text := null;
  v_snapshot public.fansub_boost_snapshots%rowtype;
  v_capabilities jsonb := '{}'::jsonb;
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  if v_asset_ref is null then
    return;
  end if;

  if position('store-assets://fansubs/' || p_fansub_id::text || '/backgrounds/slots/slot-' in v_asset_ref) <> 1 then
    raise exception 'Fansub arka plan ref bu fansuba ait degil.';
  end if;

  v_media_kind := public.resolve_store_asset_media_kind(v_asset_ref);
  if v_media_kind is null then
    raise exception 'Fansub arka plan medya tipi gecersiz.';
  end if;

  v_snapshot := public.maybe_refresh_fansub_boost_snapshot(p_fansub_id);
  v_capabilities := coalesce(v_snapshot.capabilities, public.build_fansub_boost_capabilities(0));

  if v_media_kind = 'image' and coalesce((v_capabilities ->> 'canUploadStaticBackground')::boolean, false) = false then
    raise exception 'Fansub arka plani yuklemek icin en az Seviye 1 boost gerekir.';
  end if;

  if v_media_kind = 'video' and coalesce((v_capabilities ->> 'canUploadVideoBackground')::boolean, false) = false then
    raise exception 'Video fansub arka plani icin en az Seviye 2 boost gerekir.';
  end if;
end;
$$;

grant execute on function public.assert_fansub_custom_background_access(uuid, text) to authenticated;

create or replace function public.guard_fansub_custom_background_capabilities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.custom_background_asset_url is distinct from old.custom_background_asset_url then
    perform public.assert_fansub_custom_background_access(new.id, new.custom_background_asset_url);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fansub_custom_background_capabilities on public.fansubs;
create trigger trg_fansub_custom_background_capabilities
  before insert or update of custom_background_asset_url on public.fansubs
  for each row
  execute function public.guard_fansub_custom_background_capabilities();

create or replace function public.get_public_fansub_boost_snapshot(
  p_fansub_id uuid
)
returns table (
  fansub_id uuid,
  active_power integer,
  tier_level integer,
  active_supporter_count integer,
  active_grant_count integer,
  active_monthly_supporter_count integer,
  active_mega_supporter_count integer,
  active_top_supporter_count integer,
  capabilities jsonb,
  last_grant_expires_at timestamptz,
  current_tier_floor_power integer,
  next_tier_level integer,
  next_tier_required_power integer,
  next_tier_remaining_power integer,
  tier_progress_percent numeric
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_snapshot public.fansub_boost_snapshots%rowtype;
  v_active_power integer := 0;
  v_tier_level integer := 0;
  v_current_tier_floor_power integer := 0;
  v_next_tier_level integer := null;
  v_next_tier_required_power integer := null;
  v_next_tier_remaining_power integer := 0;
  v_tier_progress_percent numeric := 0;
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  if not exists (
    select 1
    from public.fansubs f
    where f.id = p_fansub_id
      and coalesce(f.is_active, true) = true
  ) then
    raise exception 'Fansub bulunamadi.';
  end if;

  v_snapshot := public.maybe_refresh_fansub_boost_snapshot(p_fansub_id);
  v_active_power := coalesce(v_snapshot.active_power, 0);
  v_tier_level := coalesce(v_snapshot.tier_level, 0);
  v_current_tier_floor_power := public.get_fansub_boost_tier_floor_power(v_tier_level);
  v_next_tier_level := public.get_fansub_boost_next_tier_level(v_tier_level);
  v_next_tier_required_power := public.get_fansub_boost_next_tier_required_power(v_tier_level);

  if v_next_tier_required_power is null then
    v_next_tier_remaining_power := 0;
    v_tier_progress_percent := 100;
  else
    v_next_tier_remaining_power := greatest(v_next_tier_required_power - v_active_power, 0);
    if v_next_tier_required_power <= v_current_tier_floor_power then
      v_tier_progress_percent := 0;
    else
      v_tier_progress_percent := round(
        least(
          greatest(
            (
              (v_active_power - v_current_tier_floor_power)::numeric
              / (v_next_tier_required_power - v_current_tier_floor_power)::numeric
            ) * 100,
            0
          ),
          100
        ),
        2
      );
    end if;
  end if;

  return query
  select
    p_fansub_id,
    v_active_power,
    v_tier_level,
    coalesce(v_snapshot.active_supporter_count, 0),
    coalesce(v_snapshot.active_grant_count, 0),
    coalesce(v_snapshot.active_monthly_supporter_count, 0),
    coalesce(v_snapshot.active_mega_supporter_count, 0),
    coalesce(v_snapshot.active_top_supporter_count, 0),
    coalesce(v_snapshot.capabilities, public.build_fansub_boost_capabilities(0)),
    v_snapshot.last_grant_expires_at,
    v_current_tier_floor_power,
    v_next_tier_level,
    v_next_tier_required_power,
    v_next_tier_remaining_power,
    v_tier_progress_percent;
end;
$$;

grant execute on function public.get_public_fansub_boost_snapshot(uuid) to anon, authenticated;

commit;
