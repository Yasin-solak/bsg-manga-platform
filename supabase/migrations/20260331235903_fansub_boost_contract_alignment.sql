begin;

alter table public.fansub_boost_snapshots
  add column if not exists current_tier_floor_power integer not null default 0,
  add column if not exists next_tier_level integer,
  add column if not exists next_tier_required_power integer,
  add column if not exists next_tier_remaining_power integer not null default 0,
  add column if not exists tier_progress_percent numeric(5,2) not null default 0;

create or replace function public.get_fansub_boost_tier_floor_power(
  p_tier_level integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_tier_level, 0), 0)
    when 3 then 15
    when 2 then 8
    when 1 then 3
    else 0
  end;
$$;

grant execute on function public.get_fansub_boost_tier_floor_power(integer) to anon, authenticated;

create or replace function public.get_fansub_boost_next_tier_level(
  p_tier_level integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_tier_level, 0), 0)
    when 0 then 1
    when 1 then 2
    when 2 then 3
    else null
  end;
$$;

grant execute on function public.get_fansub_boost_next_tier_level(integer) to anon, authenticated;

create or replace function public.get_fansub_boost_next_tier_required_power(
  p_tier_level integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_tier_level, 0), 0)
    when 0 then 3
    when 1 then 8
    when 2 then 15
    else null
  end;
$$;

grant execute on function public.get_fansub_boost_next_tier_required_power(integer) to anon, authenticated;

create or replace function public.build_fansub_boost_capabilities(
  p_tier_level integer
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_tier_level, 0), 0)
    when 3 then jsonb_build_object(
      'tierLevel', 3,
      'tierKey', 'legend',
      'tierLabel', 'Efsane',
      'canUploadStaticBackground', true,
      'canUploadVideoBackground', true,
      'emojiSlotLimit', 8,
      'hasFullNameStyle', true,
      'canUsePolls', true,
      'hasAnalytics', true,
      'hasAdvancedAnalytics', true,
      'hasChapterEndCredit', true,
      'hasDiscoverBadge', true,
      'hasFansubProfileEffect', true,
      'hasGoldFrame', true,
      'hasShimmer', true,
      'hasVanityUrl', true,
      'hasHomepagePlacement', true,
      'hasAutoCommunityPosts', true,
      'hasInviteCard', true,
      'hasHonorWall', true,
      'canManagePinnedNotice', true,
      'canUseSupporterList', true,
      'canUseSpecialNotifications', true,
      'canShowcaseManga', true
    )
    when 2 then jsonb_build_object(
      'tierLevel', 2,
      'tierKey', 'empowered',
      'tierLabel', 'Guclenmis',
      'canUploadStaticBackground', true,
      'canUploadVideoBackground', true,
      'emojiSlotLimit', 5,
      'hasFullNameStyle', true,
      'canUsePolls', true,
      'hasAnalytics', true,
      'hasAdvancedAnalytics', false,
      'hasChapterEndCredit', true,
      'hasDiscoverBadge', true,
      'hasFansubProfileEffect', false,
      'hasGoldFrame', false,
      'hasShimmer', false,
      'hasVanityUrl', false,
      'hasHomepagePlacement', false,
      'hasAutoCommunityPosts', false,
      'hasInviteCard', false,
      'hasHonorWall', false,
      'canManagePinnedNotice', true,
      'canUseSupporterList', true,
      'canUseSpecialNotifications', true,
      'canShowcaseManga', true
    )
    when 1 then jsonb_build_object(
      'tierLevel', 1,
      'tierKey', 'rising',
      'tierLabel', 'Yukselen',
      'canUploadStaticBackground', true,
      'canUploadVideoBackground', false,
      'emojiSlotLimit', 3,
      'hasFullNameStyle', false,
      'canUsePolls', false,
      'hasAnalytics', false,
      'hasAdvancedAnalytics', false,
      'hasChapterEndCredit', false,
      'hasDiscoverBadge', false,
      'hasFansubProfileEffect', false,
      'hasGoldFrame', false,
      'hasShimmer', false,
      'hasVanityUrl', false,
      'hasHomepagePlacement', false,
      'hasAutoCommunityPosts', false,
      'hasInviteCard', false,
      'hasHonorWall', false,
      'canManagePinnedNotice', true,
      'canUseSupporterList', true,
      'canUseSpecialNotifications', true,
      'canShowcaseManga', true
    )
    else jsonb_build_object(
      'tierLevel', 0,
      'tierKey', 'base',
      'tierLabel', 'Temel',
      'canUploadStaticBackground', false,
      'canUploadVideoBackground', false,
      'emojiSlotLimit', 0,
      'hasFullNameStyle', false,
      'canUsePolls', false,
      'hasAnalytics', false,
      'hasAdvancedAnalytics', false,
      'hasChapterEndCredit', false,
      'hasDiscoverBadge', false,
      'hasFansubProfileEffect', false,
      'hasGoldFrame', false,
      'hasShimmer', false,
      'hasVanityUrl', false,
      'hasHomepagePlacement', false,
      'hasAutoCommunityPosts', false,
      'hasInviteCard', false,
      'hasHonorWall', false,
      'canManagePinnedNotice', false,
      'canUseSupporterList', false,
      'canUseSpecialNotifications', false,
      'canShowcaseManga', false
    )
  end;
$$;

grant execute on function public.build_fansub_boost_capabilities(integer) to anon, authenticated;

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
    public.build_fansub_boost_capabilities(v_tier_level),
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

  return v_snapshot;
end;
$$;

grant execute on function public.refresh_fansub_boost_snapshot(uuid) to authenticated;

drop function if exists public.get_public_fansub_boost_snapshot(uuid);

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
stable
security definer
set search_path = public
as $$
declare
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

  select
    coalesce(s.active_power, 0),
    coalesce(s.tier_level, 0)
  into
    v_active_power,
    v_tier_level
  from public.fansubs f
  left join public.fansub_boost_snapshots s
    on s.fansub_id = f.id
  where f.id = p_fansub_id
    and coalesce(f.is_active, true) = true;

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
    coalesce(s.active_power, 0),
    coalesce(s.tier_level, 0),
    coalesce(s.active_supporter_count, 0),
    coalesce(s.active_grant_count, 0),
    coalesce(s.active_monthly_supporter_count, 0),
    coalesce(s.active_mega_supporter_count, 0),
    coalesce(s.active_top_supporter_count, 0),
    coalesce(s.capabilities, public.build_fansub_boost_capabilities(0)),
    s.last_grant_expires_at,
    v_current_tier_floor_power,
    v_next_tier_level,
    v_next_tier_required_power,
    v_next_tier_remaining_power,
    v_tier_progress_percent
  from public.fansubs f
  left join public.fansub_boost_snapshots s
    on s.fansub_id = f.id
  where f.id = p_fansub_id
    and coalesce(f.is_active, true) = true;
end;
$$;

grant execute on function public.get_public_fansub_boost_snapshot(uuid) to anon, authenticated;

update public.fansub_boost_snapshots s
set current_tier_floor_power = public.get_fansub_boost_tier_floor_power(s.tier_level),
    next_tier_level = public.get_fansub_boost_next_tier_level(s.tier_level),
    next_tier_required_power = public.get_fansub_boost_next_tier_required_power(s.tier_level),
    next_tier_remaining_power = case
      when public.get_fansub_boost_next_tier_required_power(s.tier_level) is null then 0
      else greatest(public.get_fansub_boost_next_tier_required_power(s.tier_level) - coalesce(s.active_power, 0), 0)
    end,
    tier_progress_percent = case
      when public.get_fansub_boost_next_tier_required_power(s.tier_level) is null then 100
      when public.get_fansub_boost_next_tier_required_power(s.tier_level) <= public.get_fansub_boost_tier_floor_power(s.tier_level) then 0
      else round(
        least(
          greatest(
            (
              (coalesce(s.active_power, 0) - public.get_fansub_boost_tier_floor_power(s.tier_level))::numeric
              / (
                public.get_fansub_boost_next_tier_required_power(s.tier_level)
                - public.get_fansub_boost_tier_floor_power(s.tier_level)
              )::numeric
            ) * 100,
            0
          ),
          100
        ),
        2
      )
    end;

commit;
