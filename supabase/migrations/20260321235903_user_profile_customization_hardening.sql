begin;

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

create or replace function public.equip_fansub_inventory_item(
  p_fansub_id uuid,
  p_item_id uuid,
  p_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fansubs%rowtype;
  v_item public.store_items%rowtype;
begin
  if p_fansub_id is null or p_item_id is null then
    raise exception 'Fansub ve urun kimligi zorunludur.';
  end if;

  if p_type not in ('frame', 'background', 'pattern', 'profile_effect') then
    raise exception 'Desteklenmeyen fansub kozmetik tipi.';
  end if;

  if not public.is_admin() and not public.is_fansub_admin(p_fansub_id) then
    raise exception 'Bu fansub icin yetkiniz yok.';
  end if;

  select *
  into v_item
  from public.store_items
  where id = p_item_id
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Urun bulunamadi.';
  end if;

  if v_item.type <> p_type then
    raise exception 'Kozmetik tipi urun kaydi ile eslesmiyor.';
  end if;

  if not exists (
    select 1
    from public.fansub_inventory fi
    where fi.fansub_id = p_fansub_id
      and fi.store_item_id = p_item_id
  ) then
    raise exception 'Fansub envanterinde olmayan urun secilemez.';
  end if;

  update public.fansubs
  set active_frame_id = case when p_type = 'frame' then p_item_id else active_frame_id end,
      active_background_id = case when p_type = 'background' then p_item_id else active_background_id end,
      active_pattern_id = case when p_type = 'pattern' then p_item_id else active_pattern_id end,
      active_profile_effect_id = case when p_type = 'profile_effect' then p_item_id else active_profile_effect_id end
  where id = p_fansub_id
  returning *
  into v_row;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'active_frame_id', v_row.active_frame_id,
    'active_background_id', v_row.active_background_id,
    'active_pattern_id', v_row.active_pattern_id,
    'active_profile_effect_id', v_row.active_profile_effect_id
  );
end;
$$;

grant execute on function public.equip_fansub_inventory_item(uuid, uuid, text) to authenticated;

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

commit;
