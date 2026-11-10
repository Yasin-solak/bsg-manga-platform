alter table public.store_items
  drop constraint if exists store_items_type_check;

alter table public.store_items
  add constraint store_items_type_check
  check (type in ('frame', 'badge', 'premium', 'pattern', 'background', 'profile_effect'));

alter table public.users
  add column if not exists active_profile_effect_id uuid references public.store_items(id) on delete set null;

alter table public.users
  alter column owned_items set default '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb;

-- Note: in migrations run from the SQL editor the users trigger can block this bulk backfill.
-- The app layer treats a missing profile_effects key as an empty array;
-- purchase/equip flows also create this field as needed with jsonb_set.

create table if not exists public.store_profile_effect_assets (
  item_id uuid primary key references public.store_items(id) on delete cascade,
  poster_asset_url text not null,
  profile_intro_asset_url text not null,
  profile_loop_asset_url text not null,
  hover_intro_asset_url text not null,
  hover_loop_asset_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_profile_effect_assets_is_active_idx
  on public.store_profile_effect_assets (is_active);

drop trigger if exists set_store_profile_effect_assets_updated_at on public.store_profile_effect_assets;
create trigger set_store_profile_effect_assets_updated_at
  before update on public.store_profile_effect_assets
  for each row
  execute function public.set_updated_at();

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
  v_config public.premium_runtime_config%rowtype;
  v_premium_started_at timestamptz;
  v_premium_expires_at timestamptz;
  v_reward_item public.store_items%rowtype;
  v_reward_identifier text;
  v_reward_type text;
  v_compensation_coins integer := 0;
  v_premium_identifier text;
  v_next_active_profile_effect_id uuid;
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

  v_owned := coalesce(v_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb);
  v_new_stones := v_user.stones - v_item.price;
  v_next_active_profile_effect_id := v_user.active_profile_effect_id;

  if v_item.type <> 'premium' then
    v_target_key := case v_item.type
      when 'frame' then 'frames'
      when 'background' then 'backgrounds'
      when 'pattern' then 'patterns'
      when 'badge' then 'badges'
      when 'profile_effect' then 'profile_effects'
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

    if v_item.type = 'profile_effect' and v_next_active_profile_effect_id is null then
      v_next_active_profile_effect_id := v_item.id;
    end if;

    update public.users
    set stones = v_new_stones,
        owned_items = v_owned,
        active_profile_effect_id = v_next_active_profile_effect_id
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
      'premium_expires_at', v_user.premium_expires_at,
      'active_profile_effect_id', v_next_active_profile_effect_id
    );
  end if;

  select *
  into v_config
  from public.premium_runtime_config cfg
  where cfg.id = true
  for update;

  if not found then
    raise exception 'Premium runtime ayari bulunamadi.';
  end if;

  if v_config.premium_store_item_id <> v_item.id then
    raise exception 'Secilen premium urun aktif premium ayariyla uyusmuyor.';
  end if;

  v_premium_identifier := coalesce(v_item.identifier, v_item.id::text);
  v_target_array := coalesce(v_owned -> 'premium', '[]'::jsonb);
  if not exists (
    select 1
    from jsonb_array_elements_text(v_target_array) as t(value)
    where t.value = v_premium_identifier
  ) then
    v_target_array := v_target_array || to_jsonb(v_premium_identifier);
    v_owned := jsonb_set(v_owned, '{premium}', v_target_array, true);
  end if;

  select si.*
  into v_reward_item
  from public.store_items si
  where si.type in ('frame', 'background', 'pattern')
    and si.is_active = true
    and not exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(
          v_owned -> case si.type
            when 'frame' then 'frames'
            when 'background' then 'backgrounds'
            else 'patterns'
          end,
          '[]'::jsonb
        )
      ) as owned_value(value)
      where owned_value.value = coalesce(si.identifier, si.id::text)
    )
  order by random()
  limit 1;

  if found then
    v_reward_type := v_reward_item.type;
    v_reward_identifier := coalesce(v_reward_item.identifier, v_reward_item.id::text);
    v_target_key := case v_reward_type
      when 'frame' then 'frames'
      when 'background' then 'backgrounds'
      else 'patterns'
    end;
    v_target_array := coalesce(v_owned -> v_target_key, '[]'::jsonb) || to_jsonb(v_reward_identifier);
    v_owned := jsonb_set(v_owned, array[v_target_key], v_target_array, true);
  else
    v_compensation_coins := coalesce(v_config.compensation_coins, 0);
    v_new_stones := v_new_stones + v_compensation_coins;
  end if;

  insert into public.user_badges (
    user_id,
    badge_id,
    is_displayed,
    display_order
  )
  values (
    v_user_id,
    v_config.premium_badge_id,
    false,
    0
  )
  on conflict (user_id, badge_id) do nothing;

  v_premium_started_at := greatest(v_now, coalesce(v_user.premium_expires_at, v_now));
  v_premium_expires_at := v_premium_started_at + make_interval(days => v_config.premium_duration_days);

  insert into public.user_premium_subscriptions (
    user_id,
    package_id,
    runtime_config_id,
    premium_store_item_id,
    purchased_at,
    extension_started_at,
    extension_expires_at,
    extension_days,
    source
  )
  values (
    v_user_id,
    null,
    v_config.id,
    v_item.id,
    v_now,
    v_premium_started_at,
    v_premium_expires_at,
    v_config.premium_duration_days,
    'store_purchase'
  );

  insert into public.user_premium_reward_events (
    user_id,
    runtime_config_id,
    premium_store_item_id,
    rewarded_store_item_id,
    rewarded_store_item_type,
    rewarded_store_item_identifier,
    premium_badge_id,
    compensation_coins,
    premium_started_at,
    premium_expires_at,
    source
  )
  values (
    v_user_id,
    v_config.id,
    v_item.id,
    v_reward_item.id,
    v_reward_type,
    v_reward_identifier,
    v_config.premium_badge_id,
    v_compensation_coins,
    v_premium_started_at,
    v_premium_expires_at,
    'store_purchase'
  );

  update public.users
  set stones = v_new_stones,
      owned_items = v_owned,
      premium_expires_at = v_premium_expires_at,
      active_profile_effect_id = v_next_active_profile_effect_id
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
    'premium_duration_days', v_config.premium_duration_days,
    'premium_badge_id', v_config.premium_badge_id,
    'premium_compensation_coins', v_compensation_coins,
    'active_profile_effect_id', v_next_active_profile_effect_id,
    'premium_reward',
      case
        when v_reward_item.id is null then null
        else jsonb_build_object(
          'id', v_reward_item.id,
          'identifier', coalesce(v_reward_item.identifier, v_reward_item.id::text),
          'name', v_reward_item.name,
          'type', v_reward_item.type,
          'custom_asset_url', v_reward_item.custom_asset_url
        )
      end
  );
end;
$$;

grant execute on function public.purchase_store_item(uuid) to authenticated;
