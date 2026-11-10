-- ============================================
-- MangaZone | Premium monthly package model (PRE)
-- Date: 2026-02-21
-- ============================================

begin;

alter table public.users
  add column if not exists premium_expires_at timestamptz;

create index if not exists users_premium_expires_at_idx
  on public.users (premium_expires_at desc);

create table if not exists public.premium_monthly_packages (
  id uuid primary key default gen_random_uuid(),
  month_key text not null
    check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  premium_store_item_id uuid not null references public.store_items(id) on delete restrict,
  frame_store_item_id uuid not null references public.store_items(id) on delete restrict,
  background_store_item_id uuid not null references public.store_items(id) on delete restrict,
  pattern_store_item_id uuid not null references public.store_items(id) on delete restrict,
  badge_id uuid not null references public.badges(id) on delete restrict,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month_key)
);

create index if not exists premium_monthly_packages_month_key_idx
  on public.premium_monthly_packages (month_key);

drop trigger if exists trg_premium_monthly_packages_set_updated_at on public.premium_monthly_packages;
create trigger trg_premium_monthly_packages_set_updated_at
  before update on public.premium_monthly_packages
  for each row
  execute function public.set_updated_at();

create or replace function public.validate_premium_monthly_package_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.store_items si
    where si.id = new.premium_store_item_id
      and si.type = 'premium'
      and si.is_active = true
  ) then
    raise exception 'Premium paketi icin secilen premium urun gecersiz veya pasif.';
  end if;

  if not exists (
    select 1
    from public.store_items si
    where si.id = new.frame_store_item_id
      and si.type = 'frame'
      and si.is_active = true
  ) then
    raise exception 'Premium paketi icin secilen cerceve urunu gecersiz veya pasif.';
  end if;

  if not exists (
    select 1
    from public.store_items si
    where si.id = new.background_store_item_id
      and si.type = 'background'
      and si.is_active = true
  ) then
    raise exception 'Premium paketi icin secilen arkaplan urunu gecersiz veya pasif.';
  end if;

  if not exists (
    select 1
    from public.store_items si
    where si.id = new.pattern_store_item_id
      and si.type = 'pattern'
      and si.is_active = true
  ) then
    raise exception 'Premium paketi icin secilen pattern urunu gecersiz veya pasif.';
  end if;

  if not exists (
    select 1
    from public.badges b
    where b.id = new.badge_id
      and b.is_active = true
      and b.target_type in ('user', 'both')
  ) then
    raise exception 'Premium paketi icin secilen rozet gecersiz veya kullaniciya atanamaz.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_premium_monthly_package_refs on public.premium_monthly_packages;
create trigger trg_validate_premium_monthly_package_refs
  before insert or update on public.premium_monthly_packages
  for each row
  execute function public.validate_premium_monthly_package_refs();

create table if not exists public.user_premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  package_id uuid not null references public.premium_monthly_packages(id) on delete restrict,
  premium_store_item_id uuid not null references public.store_items(id) on delete restrict,
  purchased_at timestamptz not null default now(),
  extension_started_at timestamptz not null,
  extension_expires_at timestamptz not null,
  extension_days integer not null default 30
    check (extension_days > 0 and extension_days <= 365),
  source text not null default 'store_purchase',
  created_at timestamptz not null default now(),
  check (extension_expires_at > extension_started_at)
);

create index if not exists user_premium_subscriptions_user_idx
  on public.user_premium_subscriptions (user_id, extension_expires_at desc);

create index if not exists user_premium_subscriptions_package_idx
  on public.user_premium_subscriptions (package_id, created_at desc);

create table if not exists public.user_premium_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  package_id uuid not null references public.premium_monthly_packages(id) on delete cascade,
  premium_store_item_id uuid not null references public.store_items(id) on delete restrict,
  frame_store_item_id uuid not null references public.store_items(id) on delete restrict,
  background_store_item_id uuid not null references public.store_items(id) on delete restrict,
  pattern_store_item_id uuid not null references public.store_items(id) on delete restrict,
  badge_id uuid not null references public.badges(id) on delete restrict,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, package_id)
);

create index if not exists user_premium_grants_user_idx
  on public.user_premium_grants (user_id, granted_at desc);

alter table public.premium_monthly_packages enable row level security;
alter table public.user_premium_subscriptions enable row level security;
alter table public.user_premium_grants enable row level security;

drop policy if exists premium_monthly_packages_select_public on public.premium_monthly_packages;
create policy premium_monthly_packages_select_public
  on public.premium_monthly_packages
  for select
  using (is_active = true or public.is_admin());

drop policy if exists premium_monthly_packages_admin_write on public.premium_monthly_packages;
create policy premium_monthly_packages_admin_write
  on public.premium_monthly_packages
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists user_premium_subscriptions_select_own_or_admin on public.user_premium_subscriptions;
create policy user_premium_subscriptions_select_own_or_admin
  on public.user_premium_subscriptions
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_premium_subscriptions_admin_write on public.user_premium_subscriptions;
create policy user_premium_subscriptions_admin_write
  on public.user_premium_subscriptions
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists user_premium_grants_select_own_or_admin on public.user_premium_grants;
create policy user_premium_grants_select_own_or_admin
  on public.user_premium_grants
  for select
  using (user_id = public.current_public_user_id() or public.is_admin());

drop policy if exists user_premium_grants_admin_write on public.user_premium_grants;
create policy user_premium_grants_admin_write
  on public.user_premium_grants
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.premium_monthly_packages to anon, authenticated;
grant select on table public.user_premium_subscriptions to authenticated;
grant select on table public.user_premium_grants to authenticated;

create or replace function public.get_active_premium_package(
  p_month_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month_key text := coalesce(
    nullif(trim(coalesce(p_month_key, '')), ''),
    to_char(now() at time zone 'UTC', 'YYYY-MM')
  );
  v_package record;
begin
  select
    p.id,
    p.month_key,
    p.premium_store_item_id,
    p.frame_store_item_id,
    p.background_store_item_id,
    p.pattern_store_item_id,
    p.badge_id,
    premium_item.identifier as premium_identifier,
    premium_item.name as premium_name,
    premium_item.price as premium_price,
    frame_item.identifier as frame_identifier,
    frame_item.name as frame_name,
    frame_item.custom_asset_url as frame_asset_url,
    background_item.identifier as background_identifier,
    background_item.name as background_name,
    background_item.custom_asset_url as background_asset_url,
    pattern_item.identifier as pattern_identifier,
    pattern_item.name as pattern_name,
    pattern_item.custom_asset_url as pattern_asset_url,
    b.name as badge_name,
    b.image_url as badge_image_url
  into v_package
  from public.premium_monthly_packages p
  join public.store_items premium_item on premium_item.id = p.premium_store_item_id
  join public.store_items frame_item on frame_item.id = p.frame_store_item_id
  join public.store_items background_item on background_item.id = p.background_store_item_id
  join public.store_items pattern_item on pattern_item.id = p.pattern_store_item_id
  join public.badges b on b.id = p.badge_id
  where p.month_key = v_month_key
    and p.is_active = true
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_package.id,
    'month_key', v_package.month_key,
    'premium_item', jsonb_build_object(
      'id', v_package.premium_store_item_id,
      'identifier', v_package.premium_identifier,
      'name', v_package.premium_name,
      'price', v_package.premium_price
    ),
    'frame_item', jsonb_build_object(
      'id', v_package.frame_store_item_id,
      'identifier', v_package.frame_identifier,
      'name', v_package.frame_name,
      'custom_asset_url', v_package.frame_asset_url
    ),
    'background_item', jsonb_build_object(
      'id', v_package.background_store_item_id,
      'identifier', v_package.background_identifier,
      'name', v_package.background_name,
      'custom_asset_url', v_package.background_asset_url
    ),
    'pattern_item', jsonb_build_object(
      'id', v_package.pattern_store_item_id,
      'identifier', v_package.pattern_identifier,
      'name', v_package.pattern_name,
      'custom_asset_url', v_package.pattern_asset_url
    ),
    'badge', jsonb_build_object(
      'id', v_package.badge_id,
      'name', v_package.badge_name,
      'image_url', v_package.badge_image_url
    )
  );
end;
$$;

grant execute on function public.get_active_premium_package(text) to anon, authenticated;

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

  return new;
end;
$$;

create or replace function public.purchase_store_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_user_id uuid;
  v_user public.users%rowtype;
  v_item public.store_items%rowtype;
  v_target_key text;
  v_target_value text;
  v_owned jsonb;
  v_target_array jsonb;
  v_already_owned boolean;
  v_new_stones integer;
  v_month_key text;
  v_package public.premium_monthly_packages%rowtype;
  v_premium_started_at timestamptz;
  v_premium_expires_at timestamptz;
  v_grants_applied boolean := false;
  v_premium_identifier text;
  v_frame_identifier text;
  v_background_identifier text;
  v_pattern_identifier text;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza satin alma su anda gecici olarak kapali.';
  end if;

  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Public profil bulunamadi.';
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Urun bulunamadi veya aktif degil.';
  end if;

  if v_item.currency <> 'Coin' then
    raise exception 'Bu urun Coin ile satin alinmiyor.';
  end if;

  if v_user.stones < v_item.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  v_owned := coalesce(v_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[]}'::jsonb);
  v_new_stones := v_user.stones - v_item.price;

  if v_item.type <> 'premium' then
    v_target_key := case v_item.type
      when 'frame' then 'frames'
      when 'background' then 'backgrounds'
      when 'pattern' then 'patterns'
      when 'badge' then 'badges'
      else 'premium'
    end;

    v_target_value := coalesce(v_item.identifier, v_item.id::text);
    v_target_array := coalesce(v_owned -> v_target_key, '[]'::jsonb);

    select exists (
      select 1
      from jsonb_array_elements_text(v_target_array) as t(value)
      where t.value = v_target_value
    )
    into v_already_owned;

    if v_already_owned then
      raise exception 'Bu urun zaten envanterinizde bulunuyor.';
    end if;

    v_target_array := v_target_array || to_jsonb(v_target_value);
    v_owned := jsonb_set(v_owned, array[v_target_key], v_target_array, true);

    update public.users
    set stones = v_new_stones,
        owned_items = v_owned
    where id = v_user_id;

    update public.store_items
    set purchase_count = purchase_count + 1
    where id = v_item.id;

    return jsonb_build_object(
      'user_id', v_user_id,
      'item_id', v_item.id,
      'item_type', v_item.type,
      'item_identifier', v_item.identifier,
      'stones', v_new_stones,
      'owned_items', v_owned,
      'premium_expires_at', v_user.premium_expires_at
    );
  end if;

  v_month_key := to_char(v_now at time zone 'UTC', 'YYYY-MM');

  select *
  into v_package
  from public.premium_monthly_packages pmp
  where pmp.month_key = v_month_key
    and pmp.is_active = true
  order by pmp.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Bu ay icin aktif premium paketi bulunamadi.';
  end if;

  if v_package.premium_store_item_id <> v_item.id then
    raise exception 'Secilen premium urun aktif aylik paketle uyusmuyor.';
  end if;

  select coalesce(identifier, id::text)
  into v_premium_identifier
  from public.store_items
  where id = v_package.premium_store_item_id;

  select coalesce(identifier, id::text)
  into v_frame_identifier
  from public.store_items
  where id = v_package.frame_store_item_id;

  select coalesce(identifier, id::text)
  into v_background_identifier
  from public.store_items
  where id = v_package.background_store_item_id;

  select coalesce(identifier, id::text)
  into v_pattern_identifier
  from public.store_items
  where id = v_package.pattern_store_item_id;

  begin
    insert into public.user_premium_grants (
      user_id,
      package_id,
      premium_store_item_id,
      frame_store_item_id,
      background_store_item_id,
      pattern_store_item_id,
      badge_id
    )
    values (
      v_user_id,
      v_package.id,
      v_package.premium_store_item_id,
      v_package.frame_store_item_id,
      v_package.background_store_item_id,
      v_package.pattern_store_item_id,
      v_package.badge_id
    );
    v_grants_applied := true;
  exception
    when unique_violation then
      v_grants_applied := false;
  end;

  if v_grants_applied then
    v_target_array := coalesce(v_owned -> 'premium', '[]'::jsonb);
    if not exists (
      select 1
      from jsonb_array_elements_text(v_target_array) as t(value)
      where t.value = v_premium_identifier
    ) then
      v_target_array := v_target_array || to_jsonb(v_premium_identifier);
      v_owned := jsonb_set(v_owned, '{premium}', v_target_array, true);
    end if;

    v_target_array := coalesce(v_owned -> 'frames', '[]'::jsonb);
    if not exists (
      select 1
      from jsonb_array_elements_text(v_target_array) as t(value)
      where t.value = v_frame_identifier
    ) then
      v_target_array := v_target_array || to_jsonb(v_frame_identifier);
      v_owned := jsonb_set(v_owned, '{frames}', v_target_array, true);
    end if;

    v_target_array := coalesce(v_owned -> 'backgrounds', '[]'::jsonb);
    if not exists (
      select 1
      from jsonb_array_elements_text(v_target_array) as t(value)
      where t.value = v_background_identifier
    ) then
      v_target_array := v_target_array || to_jsonb(v_background_identifier);
      v_owned := jsonb_set(v_owned, '{backgrounds}', v_target_array, true);
    end if;

    v_target_array := coalesce(v_owned -> 'patterns', '[]'::jsonb);
    if not exists (
      select 1
      from jsonb_array_elements_text(v_target_array) as t(value)
      where t.value = v_pattern_identifier
    ) then
      v_target_array := v_target_array || to_jsonb(v_pattern_identifier);
      v_owned := jsonb_set(v_owned, '{patterns}', v_target_array, true);
    end if;

    insert into public.user_badges (
      user_id,
      badge_id,
      is_displayed,
      display_order
    )
    values (
      v_user_id,
      v_package.badge_id,
      false,
      0
    )
    on conflict (user_id, badge_id) do nothing;
  end if;

  v_premium_started_at := greatest(v_now, coalesce(v_user.premium_expires_at, v_now));
  v_premium_expires_at := v_premium_started_at + interval '30 days';

  insert into public.user_premium_subscriptions (
    user_id,
    package_id,
    premium_store_item_id,
    purchased_at,
    extension_started_at,
    extension_expires_at,
    extension_days,
    source
  )
  values (
    v_user_id,
    v_package.id,
    v_package.premium_store_item_id,
    v_now,
    v_premium_started_at,
    v_premium_expires_at,
    30,
    'store_purchase'
  );

  update public.users
  set stones = v_new_stones,
      owned_items = v_owned,
      premium_expires_at = v_premium_expires_at
  where id = v_user_id;

  update public.store_items
  set purchase_count = purchase_count + 1
  where id = v_item.id;

  return jsonb_build_object(
    'user_id', v_user_id,
    'item_id', v_item.id,
    'item_type', v_item.type,
    'item_identifier', v_item.identifier,
    'stones', v_new_stones,
    'owned_items', v_owned,
    'premium_expires_at', v_premium_expires_at,
    'premium_package_month', v_package.month_key,
    'premium_grants_applied', v_grants_applied
  );
end;
$$;

grant execute on function public.purchase_store_item(uuid) to authenticated;

commit;
