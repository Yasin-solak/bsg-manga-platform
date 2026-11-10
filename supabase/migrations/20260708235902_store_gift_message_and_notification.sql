-- Gift message wired end to end + recipient notification added.
-- Previously: the UI had a 190-character "Mesaj ekle" field but
-- gift_store_item / gift_store_package RPCs took no message; the message
-- dropped silently on the client. Also the gift recipient got no
-- notification (inventory changed silently).
-- This migration:
-- 1) adds a message column to store_item_gifts / store_package_events,
-- 2) recreates gift RPCs with a p_message parameter
-- (old 4-arg signatures are dropped to avoid PostgREST overload ambiguity),
-- 3) sends user recipients a gift notification with push_notification
-- (fansub-targeted gifts already show in the fansub inventory panel).

begin;

alter table public.store_item_gifts
  add column if not exists message text;

alter table public.store_package_events
  add column if not exists message text;

drop function if exists public.gift_store_item(uuid, text, uuid, uuid);

create or replace function public.gift_store_item(
  p_item_id uuid,
  p_recipient_kind text,
  p_recipient_user_id uuid default null,
  p_recipient_fansub_id uuid default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sender_id uuid;
  v_sender public.users%rowtype;
  v_recipient_kind text := lower(trim(coalesce(p_recipient_kind, '')));
  v_message text := nullif(left(trim(coalesce(p_message, '')), 200), '');
  v_item public.store_items%rowtype;
  v_recipient_user public.users%rowtype;
  v_recipient_fansub public.fansubs%rowtype;
  v_target_key text;
  v_target_value text;
  v_recipient_owned jsonb;
  v_target_array jsonb;
  v_sender_new_stones integer;
  v_next_active_profile_effect_id uuid;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza hediye gonderimi su anda gecici olarak kapali.';
  end if;

  if v_recipient_kind not in ('user', 'fansub') then
    raise exception 'Gecersiz hediye hedefi.';
  end if;

  if v_recipient_kind = 'user' and p_recipient_user_id is null then
    raise exception 'Kullanici hedefi eksik.';
  end if;

  if v_recipient_kind = 'fansub' and p_recipient_fansub_id is null then
    raise exception 'Fansub hedefi eksik.';
  end if;

  v_sender_id := public.current_public_user_id();
  if v_sender_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_sender
  from public.users
  where id = v_sender_id
  for update;

  if not found then
    raise exception 'Gonderen public profil bulunamadi.';
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
    and type in ('frame', 'background', 'pattern', 'profile_effect')
  for update;

  if not found then
    raise exception 'Hediye edilecek urun bulunamadi veya desteklenmiyor.';
  end if;

  if v_item.currency <> 'Coin' then
    raise exception 'Bu urun Coin ile hediye gonderilemiyor.';
  end if;

  if v_sender.stones < v_item.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  v_target_key := case v_item.type
    when 'frame' then 'frames'
    when 'background' then 'backgrounds'
    when 'pattern' then 'patterns'
    else 'profile_effects'
  end;
  v_target_value := coalesce(v_item.identifier, v_item.id::text);

  if v_recipient_kind = 'user' then
    select *
    into v_recipient_user
    from public.users
    where id = p_recipient_user_id
      and is_active = true
      and is_banned = false
    for update;

    if not found then
      raise exception 'Hediye gonderilecek kullanici bulunamadi.';
    end if;

    v_recipient_owned := coalesce(v_recipient_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb);
    v_target_array := coalesce(v_recipient_owned -> v_target_key, '[]'::jsonb);

    if exists (
      select 1
      from jsonb_array_elements_text(v_target_array) as owned_value(value)
      where owned_value.value = v_target_value
    ) then
      raise exception 'Alici bu urune zaten sahip.';
    end if;

    v_target_array := v_target_array || to_jsonb(v_target_value);
    v_recipient_owned := jsonb_set(v_recipient_owned, array[v_target_key], v_target_array, true);
    v_next_active_profile_effect_id := v_recipient_user.active_profile_effect_id;

    if v_item.type = 'profile_effect' and v_next_active_profile_effect_id is null then
      v_next_active_profile_effect_id := v_item.id;
    end if;

    perform set_config('app.store_purchase_user_update', 'true', true);

    update public.users
    set
      owned_items = v_recipient_owned,
      active_profile_effect_id = v_next_active_profile_effect_id
    where id = v_recipient_user.id;

    perform set_config('app.store_purchase_user_update', '', true);
  else
    select *
    into v_recipient_fansub
    from public.fansubs
    where id = p_recipient_fansub_id
      and is_active = true
    for update;

    if not found then
      raise exception 'Hediye gonderilecek fansub bulunamadi.';
    end if;

    if exists (
      select 1
      from public.fansub_inventory fi
      where fi.fansub_id = v_recipient_fansub.id
        and fi.store_item_id = v_item.id
    ) then
      raise exception 'Hedef fansub bu urune zaten sahip.';
    end if;

    insert into public.fansub_inventory (
      fansub_id,
      store_item_id,
      acquired_by
    )
    values (
      v_recipient_fansub.id,
      v_item.id,
      v_sender_id
    );
  end if;

  v_sender_new_stones := v_sender.stones - v_item.price;

  perform set_config('app.store_purchase_user_update', 'true', true);

  update public.users
  set stones = v_sender_new_stones
  where id = v_sender_id;

  perform set_config('app.store_purchase_user_update', '', true);

  update public.store_items
  set purchase_count = purchase_count + 1
  where id = v_item.id;

  insert into public.store_item_gifts (
    sender_user_id,
    recipient_kind,
    recipient_user_id,
    recipient_fansub_id,
    store_item_id,
    price,
    message
  )
  values (
    v_sender_id,
    v_recipient_kind,
    case when v_recipient_kind = 'user' then p_recipient_user_id else null end,
    case when v_recipient_kind = 'fansub' then p_recipient_fansub_id else null end,
    v_item.id,
    v_item.price,
    v_message
  );

  if v_recipient_kind = 'user' then
    perform public.push_notification(
      v_recipient_user.id,
      'system',
      'Sana bir hediye geldi!',
      format('%s sana "%s" hediye etti.', coalesce(v_sender.username, 'Bir kullanici'), v_item.name)
        || case when v_message is not null then format(' Not: %s', v_message) else '' end,
      jsonb_build_object(
        'event', 'store_gift_received',
        'gift_kind', 'item',
        'item_id', v_item.id,
        'item_type', v_item.type,
        'item_identifier', v_target_value,
        'sender_user_id', v_sender_id,
        'gift_message', v_message
      )
    );
  end if;

  return jsonb_build_object(
    'sender_user_id', v_sender_id,
    'sender_stones', v_sender_new_stones,
    'recipient_kind', v_recipient_kind,
    'recipient_user_id', case when v_recipient_kind = 'user' then p_recipient_user_id else null end,
    'recipient_fansub_id', case when v_recipient_kind = 'fansub' then p_recipient_fansub_id else null end,
    'item_id', v_item.id,
    'item_identifier', v_target_value,
    'gift_message', v_message,
    'granted_item_ids', jsonb_build_array(v_item.id)
  );
end;
$function$;

drop function if exists public.gift_store_package(text, text, uuid, uuid);

create or replace function public.gift_store_package(
  p_package_key text,
  p_recipient_kind text,
  p_recipient_user_id uuid default null,
  p_recipient_fansub_id uuid default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sender_id uuid;
  v_sender public.users%rowtype;
  v_recipient_kind text := lower(trim(coalesce(p_recipient_kind, '')));
  v_message text := nullif(left(trim(coalesce(p_message, '')), 200), '');
  v_package public.store_cosmetic_packages%rowtype;
  v_frame_item public.store_items%rowtype;
  v_effect_item public.store_items%rowtype;
  v_sender_new_stones integer;
  v_recipient_user public.users%rowtype;
  v_recipient_fansub public.fansubs%rowtype;
  v_recipient_owned jsonb;
  v_frames jsonb;
  v_effects jsonb;
  v_frame_identifier text;
  v_effect_identifier text;
  v_next_active_profile_effect_id uuid;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza paket hediyesi su anda gecici olarak kapali.';
  end if;

  if v_recipient_kind not in ('user', 'fansub') then
    raise exception 'Gecersiz paket hediye hedefi.';
  end if;

  if v_recipient_kind = 'user' and p_recipient_user_id is null then
    raise exception 'Kullanici hedefi eksik.';
  end if;

  if v_recipient_kind = 'fansub' and p_recipient_fansub_id is null then
    raise exception 'Fansub hedefi eksik.';
  end if;

  v_sender_id := public.current_public_user_id();
  if v_sender_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_sender
  from public.users
  where id = v_sender_id
  for update;

  if not found then
    raise exception 'Gonderen public profil bulunamadi.';
  end if;

  select *
  into v_package
  from public.store_cosmetic_packages
  where package_key = trim(coalesce(p_package_key, ''))
    and is_active = true
  for update;

  if not found then
    raise exception 'Paket bulunamadi veya aktif degil.';
  end if;

  if v_package.currency <> 'Coin' then
    raise exception 'Bu paket Coin ile hediye gonderilemiyor.';
  end if;

  if v_sender.stones < v_package.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  select *
  into v_frame_item
  from public.store_items
  where id = v_package.frame_store_item_id
    and is_active = true
    and type = 'frame'
  for update;

  if not found then
    raise exception 'Paket cerceve urunu bulunamadi.';
  end if;

  select *
  into v_effect_item
  from public.store_items
  where id = v_package.profile_effect_store_item_id
    and is_active = true
    and type = 'profile_effect'
  for update;

  if not found then
    raise exception 'Paket profil efekti urunu bulunamadi.';
  end if;

  v_frame_identifier := coalesce(v_frame_item.identifier, v_frame_item.id::text);
  v_effect_identifier := coalesce(v_effect_item.identifier, v_effect_item.id::text);

  if v_recipient_kind = 'user' then
    select *
    into v_recipient_user
    from public.users
    where id = p_recipient_user_id
      and is_active = true
      and is_banned = false
    for update;

    if not found then
      raise exception 'Hediye gonderilecek kullanici bulunamadi.';
    end if;

    v_recipient_owned := coalesce(v_recipient_user.owned_items, '{"frames":["default"],"backgrounds":[],"patterns":[],"badges":[],"premium":[],"profile_effects":[]}'::jsonb);
    v_frames := coalesce(v_recipient_owned -> 'frames', '[]'::jsonb);
    v_effects := coalesce(v_recipient_owned -> 'profile_effects', '[]'::jsonb);

    if exists (
      select 1
      from jsonb_array_elements_text(v_frames) as owned_value(value)
      where owned_value.value = v_frame_identifier
    ) then
      raise exception 'Alici bu paketin cercevesine zaten sahip.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(v_effects) as owned_value(value)
      where owned_value.value = v_effect_identifier
    ) then
      raise exception 'Alici bu paketin profil efektine zaten sahip.';
    end if;

    v_frames := v_frames || to_jsonb(v_frame_identifier);
    v_effects := v_effects || to_jsonb(v_effect_identifier);
    v_recipient_owned := jsonb_set(v_recipient_owned, '{frames}', v_frames, true);
    v_recipient_owned := jsonb_set(v_recipient_owned, '{profile_effects}', v_effects, true);
    v_next_active_profile_effect_id := coalesce(v_recipient_user.active_profile_effect_id, v_effect_item.id);

    perform set_config('app.store_purchase_user_update', 'true', true);

    update public.users
    set
      owned_items = v_recipient_owned,
      active_profile_effect_id = v_next_active_profile_effect_id
    where id = v_recipient_user.id;

    perform set_config('app.store_purchase_user_update', '', true);
  else
    select *
    into v_recipient_fansub
    from public.fansubs
    where id = p_recipient_fansub_id
      and is_active = true
    for update;

    if not found then
      raise exception 'Hediye gonderilecek fansub bulunamadi.';
    end if;

    if exists (
      select 1
      from public.fansub_inventory fi
      where fi.fansub_id = v_recipient_fansub.id
        and fi.store_item_id in (v_frame_item.id, v_effect_item.id)
    ) then
      raise exception 'Hedef fansub paket icerigindeki urunlerden en az birine zaten sahip.';
    end if;

    insert into public.fansub_inventory (
      fansub_id,
      store_item_id,
      acquired_by
    )
    values
      (v_recipient_fansub.id, v_frame_item.id, v_sender_id),
      (v_recipient_fansub.id, v_effect_item.id, v_sender_id);
  end if;

  v_sender_new_stones := v_sender.stones - v_package.price;

  perform set_config('app.store_purchase_user_update', 'true', true);

  update public.users
  set stones = v_sender_new_stones
  where id = v_sender_id;

  perform set_config('app.store_purchase_user_update', '', true);

  update public.store_items
  set purchase_count = purchase_count + 1
  where id in (v_frame_item.id, v_effect_item.id);

  insert into public.store_package_events (
    event_type,
    actor_user_id,
    package_key,
    recipient_kind,
    recipient_user_id,
    recipient_fansub_id,
    total_price,
    granted_item_ids,
    message
  )
  values (
    'gift',
    v_sender_id,
    v_package.package_key,
    v_recipient_kind,
    case when v_recipient_kind = 'user' then p_recipient_user_id else null end,
    case when v_recipient_kind = 'fansub' then p_recipient_fansub_id else null end,
    v_package.price,
    array[v_frame_item.id, v_effect_item.id]::uuid[],
    v_message
  );

  if v_recipient_kind = 'user' then
    perform public.push_notification(
      v_recipient_user.id,
      'system',
      'Sana bir hediye paketi geldi!',
      format('%s sana "%s" paketini hediye etti.', coalesce(v_sender.username, 'Bir kullanici'), v_package.name)
        || case when v_message is not null then format(' Not: %s', v_message) else '' end,
      jsonb_build_object(
        'event', 'store_gift_received',
        'gift_kind', 'package',
        'package_key', v_package.package_key,
        'granted_item_ids', jsonb_build_array(v_frame_item.id, v_effect_item.id),
        'sender_user_id', v_sender_id,
        'gift_message', v_message
      )
    );
  end if;

  return jsonb_build_object(
    'sender_user_id', v_sender_id,
    'sender_stones', v_sender_new_stones,
    'package_key', v_package.package_key,
    'recipient_kind', v_recipient_kind,
    'recipient_user_id', case when v_recipient_kind = 'user' then p_recipient_user_id else null end,
    'recipient_fansub_id', case when v_recipient_kind = 'fansub' then p_recipient_fansub_id else null end,
    'gift_message', v_message,
    'granted_item_ids', jsonb_build_array(v_frame_item.id, v_effect_item.id)
  );
end;
$function$;

revoke all on function public.gift_store_item(uuid, text, uuid, uuid, text) from public, anon;
revoke all on function public.gift_store_package(text, text, uuid, uuid, text) from public, anon;
grant execute on function public.gift_store_item(uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.gift_store_package(text, text, uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
