begin;

create or replace function public.is_current_user_premium_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = public.current_public_user_id()
      and coalesce(u.is_active, true) = true
      and u.premium_expires_at is not null
      and u.premium_expires_at > now()
  );
$$;

grant execute on function public.is_current_user_premium_active() to authenticated;

drop policy if exists "User upload own profile backgrounds" on storage.objects;
create policy "User upload own profile backgrounds"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'user-backgrounds'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_current_user_premium_active()
  );

drop policy if exists "User update own profile backgrounds" on storage.objects;
create policy "User update own profile backgrounds"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'user-backgrounds'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'user-backgrounds'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_current_user_premium_active()
  );

create table if not exists public.fansub_boost_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (
      code = lower(code)
      and code ~ '^[a-z0-9][a-z0-9._-]{1,31}$'
    ),
  name text not null
    check (char_length(name) between 2 and 80),
  description text not null default '',
  coin_cost integer not null check (coin_cost > 0),
  boost_power integer not null check (boost_power > 0),
  duration_days integer not null check (duration_days > 0),
  supporter_reward_tier integer not null check (supporter_reward_tier between 1 and 3),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fansub_boost_plans_active_sort_idx
  on public.fansub_boost_plans (is_active, sort_order asc, coin_cost asc);

drop trigger if exists trg_fansub_boost_plans_updated_at on public.fansub_boost_plans;
create trigger trg_fansub_boost_plans_updated_at
  before update on public.fansub_boost_plans
  for each row
  execute function public.set_updated_at();

alter table public.fansub_boost_plans enable row level security;

drop policy if exists fansub_boost_plans_select_active on public.fansub_boost_plans;
create policy fansub_boost_plans_select_active
  on public.fansub_boost_plans
  for select
  using (is_active = true or public.is_admin());

drop policy if exists fansub_boost_plans_admin_write on public.fansub_boost_plans;
create policy fansub_boost_plans_admin_write
  on public.fansub_boost_plans
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.fansub_boost_plans to anon, authenticated;
grant insert, update, delete on public.fansub_boost_plans to authenticated;

create table if not exists public.fansub_boost_grants (
  id uuid primary key default gen_random_uuid(),
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  supporter_user_id uuid not null references public.users(id) on delete cascade,
  plan_id uuid not null references public.fansub_boost_plans(id) on delete restrict,
  plan_code text not null,
  coin_cost integer not null check (coin_cost >= 0),
  boost_power integer not null check (boost_power > 0),
  duration_days integer not null check (duration_days > 0),
  supporter_reward_tier integer not null check (supporter_reward_tier between 1 and 3),
  status text not null default 'active'
    check (status in ('active', 'expired', 'cancelled', 'refunded')),
  supporter_note text,
  is_self_boost boolean not null default false,
  granted_at timestamptz not null default now(),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fansub_boost_grants_fansub_active_idx
  on public.fansub_boost_grants (fansub_id, status, expires_at desc);
create index if not exists fansub_boost_grants_supporter_active_idx
  on public.fansub_boost_grants (supporter_user_id, status, expires_at desc);
create index if not exists fansub_boost_grants_plan_code_idx
  on public.fansub_boost_grants (plan_code, granted_at desc);

drop trigger if exists trg_fansub_boost_grants_updated_at on public.fansub_boost_grants;
create trigger trg_fansub_boost_grants_updated_at
  before update on public.fansub_boost_grants
  for each row
  execute function public.set_updated_at();

alter table public.fansub_boost_grants enable row level security;

drop policy if exists fansub_boost_grants_select_rule on public.fansub_boost_grants;
create policy fansub_boost_grants_select_rule
  on public.fansub_boost_grants
  for select
  using (
    public.is_admin()
    or supporter_user_id = public.current_public_user_id()
    or public.is_fansub_admin(fansub_id)
  );

grant select on public.fansub_boost_grants to authenticated;

create table if not exists public.fansub_boost_supporter_states (
  fansub_id uuid not null references public.fansubs(id) on delete cascade,
  supporter_user_id uuid not null references public.users(id) on delete cascade,
  active_grant_count integer not null default 0,
  active_total_power integer not null default 0,
  highest_active_plan_code text,
  supporter_reward_tier integer not null default 0 check (supporter_reward_tier between 0 and 3),
  reward_capabilities jsonb not null default '{}'::jsonb,
  active_until timestamptz,
  lifetime_grant_count integer not null default 0,
  lifetime_total_power integer not null default 0,
  latest_supporter_note text,
  is_visible boolean not null default true,
  last_granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fansub_id, supporter_user_id)
);

create index if not exists fansub_boost_supporter_states_supporter_idx
  on public.fansub_boost_supporter_states (supporter_user_id, active_until desc);

drop trigger if exists trg_fansub_boost_supporter_states_updated_at on public.fansub_boost_supporter_states;
create trigger trg_fansub_boost_supporter_states_updated_at
  before update on public.fansub_boost_supporter_states
  for each row
  execute function public.set_updated_at();

alter table public.fansub_boost_supporter_states enable row level security;

drop policy if exists fansub_boost_supporter_states_select_rule on public.fansub_boost_supporter_states;
create policy fansub_boost_supporter_states_select_rule
  on public.fansub_boost_supporter_states
  for select
  using (
    public.is_admin()
    or supporter_user_id = public.current_public_user_id()
    or public.is_fansub_admin(fansub_id)
  );

grant select on public.fansub_boost_supporter_states to authenticated;

create table if not exists public.fansub_boost_snapshots (
  fansub_id uuid primary key references public.fansubs(id) on delete cascade,
  active_power integer not null default 0,
  tier_level integer not null default 0 check (tier_level between 0 and 3),
  active_supporter_count integer not null default 0,
  active_grant_count integer not null default 0,
  active_monthly_supporter_count integer not null default 0,
  active_mega_supporter_count integer not null default 0,
  active_top_supporter_count integer not null default 0,
  capabilities jsonb not null default '{}'::jsonb,
  last_grant_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_fansub_boost_snapshots_updated_at on public.fansub_boost_snapshots;
create trigger trg_fansub_boost_snapshots_updated_at
  before update on public.fansub_boost_snapshots
  for each row
  execute function public.set_updated_at();

alter table public.fansub_boost_snapshots enable row level security;

drop policy if exists fansub_boost_snapshots_select_public on public.fansub_boost_snapshots;
create policy fansub_boost_snapshots_select_public
  on public.fansub_boost_snapshots
  for select
  using (true);

grant select on public.fansub_boost_snapshots to anon, authenticated;

create or replace function public.resolve_fansub_boost_tier(
  p_active_power integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_active_power, 0) >= 15 then 3
    when coalesce(p_active_power, 0) >= 8 then 2
    when coalesce(p_active_power, 0) >= 3 then 1
    else 0
  end;
$$;

grant execute on function public.resolve_fansub_boost_tier(integer) to anon, authenticated;

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

create or replace function public.build_fansub_boost_supporter_capabilities(
  p_reward_tier integer
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case greatest(coalesce(p_reward_tier, 0), 0)
    when 3 then jsonb_build_object(
      'rewardTier', 3,
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', true,
      'hasSupporterProfileEffect', true,
      'hasSupporterSpotlight', true
    )
    when 2 then jsonb_build_object(
      'rewardTier', 2,
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', true,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
    when 1 then jsonb_build_object(
      'rewardTier', 1,
      'hasActiveSupporterBadge', true,
      'canUseSupporterEmojis', true,
      'canShowSupporterNote', true,
      'canAppearInSupporterList', true,
      'canAppearInCreditPage', true,
      'hasSupporterFrame', false,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
    else jsonb_build_object(
      'rewardTier', 0,
      'hasActiveSupporterBadge', false,
      'canUseSupporterEmojis', false,
      'canShowSupporterNote', false,
      'canAppearInSupporterList', false,
      'canAppearInCreditPage', false,
      'hasSupporterFrame', false,
      'hasSupporterProfileEffect', false,
      'hasSupporterSpotlight', false
    )
  end;
$$;

grant execute on function public.build_fansub_boost_supporter_capabilities(integer) to anon, authenticated;

create or replace function public.refresh_fansub_boost_supporter_state(
  p_fansub_id uuid,
  p_supporter_user_id uuid
)
returns public.fansub_boost_supporter_states
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_grant_count integer := 0;
  v_active_total_power integer := 0;
  v_supporter_reward_tier integer := 0;
  v_active_until timestamptz := null;
  v_last_granted_at timestamptz := null;
  v_lifetime_grant_count integer := 0;
  v_lifetime_total_power integer := 0;
  v_highest_active_plan_code text := null;
  v_latest_supporter_note text := null;
  v_state public.fansub_boost_supporter_states%rowtype;
begin
  if p_fansub_id is null or p_supporter_user_id is null then
    raise exception 'Fansub ve destekci kimligi zorunludur.';
  end if;

  update public.fansub_boost_grants
  set status = 'expired'
  where fansub_id = p_fansub_id
    and supporter_user_id = p_supporter_user_id
    and status = 'active'
    and expires_at <= now();

  select
    count(*)::integer,
    coalesce(sum(g.boost_power), 0)::integer,
    coalesce(max(g.supporter_reward_tier), 0)::integer,
    max(g.expires_at),
    max(g.granted_at)
  into
    v_active_grant_count,
    v_active_total_power,
    v_supporter_reward_tier,
    v_active_until,
    v_last_granted_at
  from public.fansub_boost_grants g
  where g.fansub_id = p_fansub_id
    and g.supporter_user_id = p_supporter_user_id
    and g.status = 'active'
    and g.expires_at > now();

  select
    count(*)::integer,
    coalesce(sum(g.boost_power), 0)::integer
  into
    v_lifetime_grant_count,
    v_lifetime_total_power
  from public.fansub_boost_grants g
  where g.fansub_id = p_fansub_id
    and g.supporter_user_id = p_supporter_user_id
    and g.status in ('active', 'expired');

  select g.plan_code
  into v_highest_active_plan_code
  from public.fansub_boost_grants g
  where g.fansub_id = p_fansub_id
    and g.supporter_user_id = p_supporter_user_id
    and g.status = 'active'
    and g.expires_at > now()
  order by g.supporter_reward_tier desc, g.boost_power desc, g.granted_at desc
  limit 1;

  select nullif(trim(coalesce(g.supporter_note, '')), '')
  into v_latest_supporter_note
  from public.fansub_boost_grants g
  where g.fansub_id = p_fansub_id
    and g.supporter_user_id = p_supporter_user_id
    and nullif(trim(coalesce(g.supporter_note, '')), '') is not null
  order by g.granted_at desc
  limit 1;

  insert into public.fansub_boost_supporter_states (
    fansub_id,
    supporter_user_id,
    active_grant_count,
    active_total_power,
    highest_active_plan_code,
    supporter_reward_tier,
    reward_capabilities,
    active_until,
    lifetime_grant_count,
    lifetime_total_power,
    latest_supporter_note,
    last_granted_at
  )
  values (
    p_fansub_id,
    p_supporter_user_id,
    v_active_grant_count,
    v_active_total_power,
    v_highest_active_plan_code,
    v_supporter_reward_tier,
    public.build_fansub_boost_supporter_capabilities(v_supporter_reward_tier),
    v_active_until,
    v_lifetime_grant_count,
    v_lifetime_total_power,
    v_latest_supporter_note,
    v_last_granted_at
  )
  on conflict (fansub_id, supporter_user_id) do update
    set active_grant_count = excluded.active_grant_count,
        active_total_power = excluded.active_total_power,
        highest_active_plan_code = excluded.highest_active_plan_code,
        supporter_reward_tier = excluded.supporter_reward_tier,
        reward_capabilities = excluded.reward_capabilities,
        active_until = excluded.active_until,
        lifetime_grant_count = excluded.lifetime_grant_count,
        lifetime_total_power = excluded.lifetime_total_power,
        latest_supporter_note = excluded.latest_supporter_note,
        last_granted_at = excluded.last_granted_at
  returning *
  into v_state;

  return v_state;
end;
$$;

grant execute on function public.refresh_fansub_boost_supporter_state(uuid, uuid) to authenticated;

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
    last_grant_expires_at
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
    v_last_grant_expires_at
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
        last_grant_expires_at = excluded.last_grant_expires_at
  returning *
  into v_snapshot;

  return v_snapshot;
end;
$$;

grant execute on function public.refresh_fansub_boost_snapshot(uuid) to authenticated;

create or replace function public.list_active_fansub_boost_plans()
returns table (
  id uuid,
  code text,
  name text,
  description text,
  coin_cost integer,
  boost_power integer,
  duration_days integer,
  supporter_reward_tier integer,
  sort_order integer,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.code,
    p.name,
    p.description,
    p.coin_cost,
    p.boost_power,
    p.duration_days,
    p.supporter_reward_tier,
    p.sort_order,
    p.metadata
  from public.fansub_boost_plans p
  where p.is_active = true
  order by p.sort_order asc, p.coin_cost asc, p.created_at asc;
$$;

grant execute on function public.list_active_fansub_boost_plans() to anon, authenticated;

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
  last_grant_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
    s.last_grant_expires_at
  from public.fansubs f
  left join public.fansub_boost_snapshots s
    on s.fansub_id = f.id
  where f.id = p_fansub_id
    and coalesce(f.is_active, true) = true;
end;
$$;

grant execute on function public.get_public_fansub_boost_snapshot(uuid) to anon, authenticated;

create or replace function public.get_my_fansub_boost_supporter_state(
  p_fansub_id uuid
)
returns table (
  fansub_id uuid,
  supporter_user_id uuid,
  active_grant_count integer,
  active_total_power integer,
  highest_active_plan_code text,
  supporter_reward_tier integer,
  reward_capabilities jsonb,
  active_until timestamptz,
  lifetime_grant_count integer,
  lifetime_total_power integer,
  latest_supporter_note text,
  is_visible boolean,
  last_granted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
begin
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  perform public.refresh_fansub_boost_supporter_state(p_fansub_id, v_user_id);

  return query
  select
    s.fansub_id,
    s.supporter_user_id,
    s.active_grant_count,
    s.active_total_power,
    s.highest_active_plan_code,
    s.supporter_reward_tier,
    s.reward_capabilities,
    s.active_until,
    s.lifetime_grant_count,
    s.lifetime_total_power,
    s.latest_supporter_note,
    s.is_visible,
    s.last_granted_at
  from public.fansub_boost_supporter_states s
  where s.fansub_id = p_fansub_id
    and s.supporter_user_id = v_user_id;
end;
$$;

grant execute on function public.get_my_fansub_boost_supporter_state(uuid) to authenticated;

create or replace function public.purchase_fansub_boost(
  p_fansub_id uuid,
  p_plan_code text,
  p_supporter_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_user public.users%rowtype;
  v_fansub public.fansubs%rowtype;
  v_plan public.fansub_boost_plans%rowtype;
  v_grant public.fansub_boost_grants%rowtype;
  v_supporter_state public.fansub_boost_supporter_states%rowtype;
  v_snapshot public.fansub_boost_snapshots%rowtype;
  v_supporter_note text := nullif(trim(coalesce(p_supporter_note, '')), '');
  v_event_key text;
  v_member record;
begin
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if not public.is_feature_enabled('boost.system', false) then
    raise exception 'Fansub takviye sistemi su anda aktif degil.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_user_id
  for update;

  if not found or coalesce(v_user.is_active, true) = false then
    raise exception 'Aktif kullanici bulunamadi.';
  end if;

  select *
  into v_fansub
  from public.fansubs
  where id = p_fansub_id
    and coalesce(is_active, true) = true
  limit 1;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  select *
  into v_plan
  from public.fansub_boost_plans
  where code = lower(trim(coalesce(p_plan_code, '')))
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Takviye plani bulunamadi.';
  end if;

  if v_supporter_note is not null and char_length(v_supporter_note) > 220 then
    raise exception 'Destek notu en fazla 220 karakter olabilir.';
  end if;

  if coalesce(v_user.stones, 0) < v_plan.coin_cost then
    raise exception 'Yeterli coin bulunamadi.';
  end if;

  update public.users
  set stones = stones - v_plan.coin_cost
  where id = v_user_id;

  insert into public.fansub_boost_grants (
    fansub_id,
    supporter_user_id,
    plan_id,
    plan_code,
    coin_cost,
    boost_power,
    duration_days,
    supporter_reward_tier,
    supporter_note,
    is_self_boost,
    starts_at,
    expires_at,
    metadata
  )
  values (
    p_fansub_id,
    v_user_id,
    v_plan.id,
    v_plan.code,
    v_plan.coin_cost,
    v_plan.boost_power,
    v_plan.duration_days,
    v_plan.supporter_reward_tier,
    v_supporter_note,
    exists (
      select 1
      from public.fansub_members fm
      where fm.fansub_id = p_fansub_id
        and fm.user_id = v_user_id
    ),
    now(),
    now() + make_interval(days => v_plan.duration_days),
    jsonb_build_object(
      'planName', v_plan.name,
      'supporterUsername', v_user.username
    )
  )
  returning *
  into v_grant;

  v_supporter_state := public.refresh_fansub_boost_supporter_state(p_fansub_id, v_user_id);
  v_snapshot := public.refresh_fansub_boost_snapshot(p_fansub_id);
  v_event_key := format('fansub-boost:%s:%s', v_grant.id::text, p_fansub_id::text);

  for v_member in
    select fm.user_id
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
      and fm.role = 'admin'
      and fm.user_id <> v_user_id
  loop
    perform public.push_notification(
      v_member.user_id,
      'system',
      'Fansub takviyesi alindi',
      format('%s, %s planini etkinlestirdi.', coalesce(v_user.username, 'Bir destekci'), v_plan.name),
      jsonb_build_object(
        'event', 'fansub_boost_purchased',
        'fansub_id', p_fansub_id,
        'grant_id', v_grant.id,
        'plan_code', v_plan.code,
        'plan_name', v_plan.name,
        'supporter_user_id', v_user_id,
        'supporter_username', v_user.username,
        'event_key', format('%s:%s', v_event_key, v_member.user_id::text)
      ),
      'bolt'
    );
  end loop;

  return jsonb_build_object(
    'grantId', v_grant.id,
    'fansubId', p_fansub_id,
    'planCode', v_plan.code,
    'planName', v_plan.name,
    'coinCost', v_plan.coin_cost,
    'boostPower', v_plan.boost_power,
    'durationDays', v_plan.duration_days,
    'supporterRewardTier', v_plan.supporter_reward_tier,
    'startsAt', v_grant.starts_at,
    'expiresAt', v_grant.expires_at,
    'newUserStones', greatest(coalesce(v_user.stones, 0) - v_plan.coin_cost, 0),
    'supporterState', row_to_json(v_supporter_state),
    'snapshot', row_to_json(v_snapshot)
  );
end;
$$;

grant execute on function public.purchase_fansub_boost(uuid, text, text) to authenticated;

create or replace function public.update_my_profile_customization(
  p_apply_frame_type boolean default false,
  p_frame_type text default null,
  p_apply_background_type boolean default false,
  p_background_type text default null,
  p_apply_profile_effect boolean default false,
  p_active_profile_effect_id uuid default null,
  p_owned_items_patch jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_user public.users%rowtype;
  v_owned jsonb;
  v_frame_type text;
  v_background_type text;
  v_uploaded_slots jsonb;
  v_uploaded_slot_item jsonb;
  v_uploaded_slot_ref text;
  v_uploaded_slot_index integer;
  v_uploaded_slot_media_type text;
  v_uploaded_slot_label text;
  v_uploaded_slot_updated_at text;
  v_profile_effect public.store_items%rowtype;
  v_has_uploaded_background boolean := false;
  v_has_background boolean := false;
  v_has_frame boolean := false;
  v_has_profile_effect boolean := false;
  v_background_entry text;
  v_frame_entry text;
  v_profile_effect_entry text;
  v_patch_active_name_style jsonb;
  v_patch_active_name_effect text;
  v_is_premium_active boolean := false;
begin
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profil bulunamadi.';
  end if;

  v_owned := coalesce(
    v_user.owned_items,
    '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb
  );
  v_frame_type := coalesce(nullif(trim(v_user.frame_type), ''), 'default');
  v_background_type := nullif(trim(coalesce(v_user.background_type, '')), '');
  v_is_premium_active := v_user.premium_expires_at is not null and v_user.premium_expires_at > now();

  if p_owned_items_patch is not null then
    if jsonb_typeof(p_owned_items_patch) <> 'object' then
      raise exception 'owned_items guncelleme yukunun object olmasi gerekir.';
    end if;

    if p_owned_items_patch ? 'uploaded_background_slots' then
      if not v_is_premium_active then
        raise exception 'Yuklenen profil arka planlari icin premium gerekir.';
      end if;

      if jsonb_typeof(p_owned_items_patch -> 'uploaded_background_slots') <> 'array' then
        raise exception 'uploaded_background_slots dizi olmalidir.';
      end if;

      v_uploaded_slots := '[]'::jsonb;

      for v_uploaded_slot_item in
        select value
        from jsonb_array_elements(p_owned_items_patch -> 'uploaded_background_slots')
      loop
        if jsonb_typeof(v_uploaded_slot_item) <> 'object' then
          raise exception 'uploaded_background_slots yalniz object kayitlari icerebilir.';
        end if;

        if not (v_uploaded_slot_item ? 'slotIndex') then
          raise exception 'uploaded background slotIndex zorunludur.';
        end if;

        begin
          v_uploaded_slot_index := (v_uploaded_slot_item ->> 'slotIndex')::integer;
        exception
          when others then
            raise exception 'uploaded background slotIndex gecersiz.';
        end;

        if v_uploaded_slot_index < 0 or v_uploaded_slot_index > 9 then
          raise exception 'uploaded background slotIndex aralik disi.';
        end if;

        v_uploaded_slot_ref := nullif(trim(coalesce(v_uploaded_slot_item ->> 'ref', '')), '');
        if v_uploaded_slot_ref is null then
          raise exception 'uploaded background ref zorunludur.';
        end if;

        if position('store-assets://user-backgrounds/' || auth.uid()::text || '/slots/slot-' in v_uploaded_slot_ref) <> 1
          and position('store-assets://user-backgrounds/' || auth.uid()::text || '/live/' in v_uploaded_slot_ref) <> 1
        then
          raise exception 'uploaded background ref bu kullaniciya ait degil.';
        end if;

        v_uploaded_slot_media_type := nullif(trim(coalesce(v_uploaded_slot_item ->> 'mediaType', '')), '');
        if v_uploaded_slot_media_type not in ('image', 'video') then
          raise exception 'uploaded background mediaType gecersiz.';
        end if;

        v_uploaded_slot_label := nullif(trim(coalesce(v_uploaded_slot_item ->> 'label', '')), '');
        v_uploaded_slot_updated_at := nullif(trim(coalesce(v_uploaded_slot_item ->> 'updatedAt', '')), '');

        v_uploaded_slots := v_uploaded_slots || jsonb_build_array(jsonb_build_object(
          'slotIndex', v_uploaded_slot_index,
          'ref', v_uploaded_slot_ref,
          'label', coalesce(v_uploaded_slot_label, 'Kisisel arka plan ' || (v_uploaded_slot_index + 1)::text),
          'mediaType', v_uploaded_slot_media_type,
          'updatedAt', coalesce(v_uploaded_slot_updated_at, now()::text)
        ));
      end loop;

      v_owned := jsonb_set(v_owned, '{uploaded_background_slots}', v_uploaded_slots, true);
    end if;

    if v_is_premium_active and p_owned_items_patch ? 'active_name_style' then
      v_patch_active_name_style := p_owned_items_patch -> 'active_name_style';
      if v_patch_active_name_style is null or jsonb_typeof(v_patch_active_name_style) = 'null' then
        v_owned := jsonb_set(v_owned, '{active_name_style}', 'null'::jsonb, true);
      elsif jsonb_typeof(v_patch_active_name_style) = 'object' then
        v_owned := jsonb_set(v_owned, '{active_name_style}', v_patch_active_name_style, true);
      else
        raise exception 'active_name_style object olmalidir.';
      end if;
    end if;

    if v_is_premium_active and p_owned_items_patch ? 'active_name_effect' then
      v_patch_active_name_effect := nullif(trim(coalesce(p_owned_items_patch ->> 'active_name_effect', '')), '');
      if v_patch_active_name_effect is null then
        v_owned := jsonb_set(v_owned, '{active_name_effect}', 'null'::jsonb, true);
      else
        v_owned := jsonb_set(v_owned, '{active_name_effect}', to_jsonb(v_patch_active_name_effect), true);
      end if;
    end if;
  end if;

  if p_apply_frame_type then
    v_frame_type := coalesce(nullif(trim(p_frame_type), ''), 'default');
    if v_frame_type <> 'default' then
      for v_frame_entry in
        select value
        from jsonb_array_elements_text(coalesce(v_owned -> 'frames', '[]'::jsonb))
      loop
        if v_frame_entry = v_frame_type then
          v_has_frame := true;
          exit;
        end if;
      end loop;

      if not v_has_frame then
        raise exception 'Sahip olunmayan cerceve secilemez.';
      end if;
    end if;
  end if;

  if p_apply_background_type then
    v_background_type := nullif(trim(coalesce(p_background_type, '')), '');
    if v_background_type is not null then
      for v_background_entry in
        select value
        from jsonb_array_elements_text(coalesce(v_owned -> 'backgrounds', '[]'::jsonb))
      loop
        if v_background_entry = v_background_type then
          v_has_background := true;
          exit;
        end if;
      end loop;

      if not v_has_background then
        for v_uploaded_slot_item in
          select value
          from jsonb_array_elements(coalesce(v_owned -> 'uploaded_background_slots', '[]'::jsonb))
        loop
          if nullif(trim(coalesce(v_uploaded_slot_item ->> 'ref', '')), '') = v_background_type then
            v_has_uploaded_background := true;
            exit;
          end if;
        end loop;
      end if;

      if v_has_uploaded_background and not v_is_premium_active then
        raise exception 'Yuklenen profil arka planini kullanmak icin premium gerekir.';
      end if;

      if not v_has_background and not v_has_uploaded_background then
        raise exception 'Sahip olunmayan arka plan secilemez.';
      end if;
    end if;
  end if;

  if p_apply_profile_effect then
    if p_active_profile_effect_id is not null then
      select *
      into v_profile_effect
      from public.store_items
      where id = p_active_profile_effect_id
        and type = 'profile_effect'
        and is_active = true
      limit 1;

      if not found then
        raise exception 'Profil efekti bulunamadi.';
      end if;

      for v_profile_effect_entry in
        select value
        from jsonb_array_elements_text(coalesce(v_owned -> 'profile_effects', '[]'::jsonb))
      loop
        if v_profile_effect_entry = v_profile_effect.id::text
          or v_profile_effect_entry = coalesce(v_profile_effect.identifier, '')
        then
          v_has_profile_effect := true;
          exit;
        end if;
      end loop;

      if not v_has_profile_effect then
        raise exception 'Sahip olunmayan profil efekti secilemez.';
      end if;
    end if;
  end if;

  update public.users
  set owned_items = v_owned,
      frame_type = case when p_apply_frame_type then v_frame_type else frame_type end,
      background_type = case when p_apply_background_type then v_background_type else background_type end,
      active_profile_effect_id = case
        when p_apply_profile_effect then p_active_profile_effect_id
        else active_profile_effect_id
      end
  where id = v_user_id;

  select *
  into v_user
  from public.users
  where id = v_user_id;

  return jsonb_build_object(
    'id', v_user.id,
    'frame_type', v_user.frame_type,
    'background_type', v_user.background_type,
    'active_profile_effect_id', v_user.active_profile_effect_id,
    'owned_items', v_user.owned_items,
    'premium_expires_at', v_user.premium_expires_at
  );
end;
$$;

grant execute on function public.update_my_profile_customization(boolean, text, boolean, text, boolean, uuid, jsonb) to authenticated;

create or replace function public.prevent_non_admin_sensitive_user_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := public.current_public_user_id();
  v_context text := '';
  v_allow_sensitive boolean := false;
begin
  get diagnostics v_context = PG_CONTEXT;

  v_allow_sensitive := (
    v_context ~* 'function[[:space:]]+(public\.)?purchase_store_item[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_user_badge[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_badge[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?redeem_coin_code[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?claim_user_reward_task[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_store_item_with_user_wallet[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?set_user_ban_state[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?release_my_expired_ban[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?release_expired_bans[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?claim_active_session[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?revoke_auth_session[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?donate_to_fansub[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?rewrite_legacy_user_avatar_url[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?update_my_profile_customization[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_boost[[:space:]]*\('
  );

  if public.is_admin() then
    return new;
  end if;

  if v_allow_sensitive then
    return new;
  end if;

  if v_caller_id is null then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;

  if old.id <> v_caller_id then
    raise exception 'Sadece kendi profilinizi guncelleyebilirsiniz.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Rol alani degistirilemez.';
  end if;

  if new.is_banned is distinct from old.is_banned then
    raise exception 'Ban alani degistirilemez.';
  end if;

  if new.is_active is distinct from old.is_active then
    raise exception 'Aktiflik alani degistirilemez.';
  end if;

  if new.stones is distinct from old.stones then
    raise exception 'Bakiye alani degistirilemez.';
  end if;

  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Hesap baglantisi degistirilemez.';
  end if;

  if new.premium_expires_at is distinct from old.premium_expires_at then
    raise exception 'Premium suresi alani degistirilemez.';
  end if;

  if new.active_session_id is distinct from old.active_session_id then
    raise exception 'Aktif session alani degistirilemez.';
  end if;

  if new.active_session_claimed_at is distinct from old.active_session_claimed_at then
    raise exception 'Session claim zamani degistirilemez.';
  end if;

  if new.owned_items is distinct from old.owned_items then
    raise exception 'Envanter alani dogrudan degistirilemez.';
  end if;

  if new.frame_type is distinct from old.frame_type then
    raise exception 'Cerceve alani dogrudan degistirilemez.';
  end if;

  if new.background_type is distinct from old.background_type then
    raise exception 'Arka plan alani dogrudan degistirilemez.';
  end if;

  if new.active_profile_effect_id is distinct from old.active_profile_effect_id then
    raise exception 'Profil efekti alani dogrudan degistirilemez.';
  end if;

  if new.active_badge_id is distinct from old.active_badge_id then
    raise exception 'Aktif rozet alani dogrudan degistirilemez.';
  end if;

  return new;
end;
$$;

insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values (
  'boost.system',
  'Fansub Takviye Sistemi',
  'Fansub boost planlari, supporter state ve tier capability akislarini ac/kapat.',
  false,
  100,
  true,
  '{}'::jsonb
)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description,
      is_public = excluded.is_public;

insert into public.fansub_boost_plans (
  code,
  name,
  description,
  coin_cost,
  boost_power,
  duration_days,
  supporter_reward_tier,
  is_active,
  sort_order,
  metadata
)
values
  (
    'monthly',
    'Aylik Takviye',
    '30 gun sureli temel boost paketi.',
    300,
    1,
    30,
    1,
    true,
    10,
    jsonb_build_object('accent', 'violet')
  ),
  (
    'mega',
    'Mega Takviye',
    '30 gun sureli orta seviye boost paketi.',
    1500,
    3,
    30,
    2,
    true,
    20,
    jsonb_build_object('accent', 'amber')
  ),
  (
    'top',
    'Top Takviye',
    '90 gun sureli en guclu boost paketi.',
    5000,
    5,
    90,
    3,
    true,
    30,
    jsonb_build_object('accent', 'rose')
  )
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      coin_cost = excluded.coin_cost,
      boost_power = excluded.boost_power,
      duration_days = excluded.duration_days,
      supporter_reward_tier = excluded.supporter_reward_tier,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      metadata = excluded.metadata;

commit;
