begin;

-- purchase_store_item uses a narrow transaction flag when updating economy fields on users,
-- so it does not depend on a call-stack regex.
create or replace function public.prevent_non_admin_sensitive_user_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_caller_id uuid := public.current_public_user_id();
  v_context text := '';
  v_request_path text := lower(coalesce(current_setting('request.path', true), ''));
  v_allow_sensitive boolean := false;
  v_session_claim_update boolean := current_setting('app.claim_active_session_update', true) = 'true';
  v_store_purchase_update boolean := current_setting('app.store_purchase_user_update', true) = 'true';
begin
  get diagnostics v_context = PG_CONTEXT;

  if public.is_admin() then
    return new;
  end if;

  if v_session_claim_update then
    if old.auth_user_id is distinct from auth.uid()
      or new.auth_user_id is distinct from old.auth_user_id
      or new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.is_banned is distinct from old.is_banned
      or new.is_active is distinct from old.is_active
      or new.stones is distinct from old.stones
      or new.premium_expires_at is distinct from old.premium_expires_at
      or new.owned_items is distinct from old.owned_items
      or (to_jsonb(new) - 'active_session_id' - 'active_session_claimed_at' - 'updated_at')
         is distinct from
         (to_jsonb(old) - 'active_session_id' - 'active_session_claimed_at' - 'updated_at')
    then
      raise exception 'Aktif session claim yalniz oturum alanlarini guncelleyebilir.';
    end if;

    return new;
  end if;

  if v_store_purchase_update then
    if new.id is distinct from old.id
      or new.auth_user_id is distinct from old.auth_user_id
      or new.role is distinct from old.role
      or new.is_banned is distinct from old.is_banned
      or new.is_active is distinct from old.is_active
      or new.active_session_id is distinct from old.active_session_id
      or new.active_session_claimed_at is distinct from old.active_session_claimed_at
      or new.frame_type is distinct from old.frame_type
      or new.background_type is distinct from old.background_type
      or (to_jsonb(new) - 'stones' - 'owned_items' - 'premium_expires_at' - 'active_profile_effect_id' - 'updated_at')
         is distinct from
         (to_jsonb(old) - 'stones' - 'owned_items' - 'premium_expires_at' - 'active_profile_effect_id' - 'updated_at')
    then
      raise exception 'Magaza satin alma yalniz ekonomi ve aktif profil efekti alanlarini guncelleyebilir.';
    end if;

    return new;
  end if;

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
    or v_context ~* 'function[[:space:]]+(public\.)?revoke_auth_session[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?donate_to_fansub[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?rewrite_legacy_user_avatar_url[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?update_my_profile_customization[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_boost[[:space:]]*\('
    or v_request_path ~ '(^|/)rpc/(purchase_store_item|purchase_user_badge|purchase_fansub_badge|redeem_coin_code|claim_user_reward_task|purchase_fansub_store_item_with_user_wallet|set_user_ban_state|release_my_expired_ban|release_expired_bans|revoke_auth_session|donate_to_fansub|rewrite_legacy_user_avatar_url|update_my_profile_customization|purchase_fansub_boost)$'
  );

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
$function$;

create or replace function public.purchase_store_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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

    perform set_config('app.store_purchase_user_update', 'true', true);

    update public.users
    set stones = v_new_stones,
        owned_items = v_owned,
        active_profile_effect_id = v_next_active_profile_effect_id
    where id = v_user_id;

    perform set_config('app.store_purchase_user_update', '', true);

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

  perform set_config('app.store_purchase_user_update', 'true', true);

  update public.users
  set stones = v_new_stones,
      owned_items = v_owned,
      premium_expires_at = v_premium_expires_at,
      active_profile_effect_id = v_next_active_profile_effect_id
  where id = v_user_id;

  perform set_config('app.store_purchase_user_update', '', true);

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
$function$;

grant execute on function public.purchase_store_item(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
