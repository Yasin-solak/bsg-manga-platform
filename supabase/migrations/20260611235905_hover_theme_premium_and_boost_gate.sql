-- Hover theme system: users with premium and fansubs with the boost capability can use
-- a two-color (mainColor + accentColor) hover card theme.
--
-- User theme: users.owned_items -> 'active_hover_theme' (premium gated)
-- Fansub theme:    fansubs.hover_theme jsonb (canUseHoverTheme boost capability gated, read gated on the client)

begin;

-- ---------------------------------------------------------------------------
-- 1) Hex renk dogrulama yardimcisi
-- ---------------------------------------------------------------------------
create or replace function app_private.is_valid_hover_theme(p_theme jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_theme is not null
    and jsonb_typeof(p_theme) = 'object'
    and coalesce(p_theme ->> 'mainColor', '') ~* '^#[0-9a-f]{6}$'
    and coalesce(p_theme ->> 'accentColor', '') ~* '^#[0-9a-f]{6}$'
$$;

-- ---------------------------------------------------------------------------
-- 2) Fansub side: hover_theme column
-- ---------------------------------------------------------------------------
alter table public.fansubs
  add column if not exists hover_theme jsonb null;

alter table public.fansubs
  drop constraint if exists fansubs_hover_theme_shape_check;

alter table public.fansubs
  add constraint fansubs_hover_theme_shape_check check (
    hover_theme is null or app_private.is_valid_hover_theme(hover_theme)
  );

-- ---------------------------------------------------------------------------
-- 3) Boost capability policy: canUseHoverTheme (Level 1, identity group)
-- Placement can change later from the admin boost policy editor.
-- ---------------------------------------------------------------------------
insert into public.fansub_boost_capability_policies as policy (
  capability_key,
  label,
  summary,
  detail,
  placement_hint,
  surface_group,
  placement_type,
  tier_level,
  sort_order
)
values (
  'canUseHoverTheme',
  'Hover temasi',
  'Fansub hover karti iki renkli gradyan tema kazanir.',
  'Ana ve tema rengi secilir; hover kartinin govdesi, kenarligi ve banner gecisi bu renklere boyanir.',
  'Duzenle modal > Hover temasi',
  'identity',
  'tier',
  1,
  140
)
on conflict (capability_key) do update
set
  label = excluded.label,
  summary = excluded.summary,
  detail = excluded.detail,
  placement_hint = excluded.placement_hint,
  surface_group = excluded.surface_group,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Refresh existing snapshot capabilities with the new policy.
select public.refresh_all_fansub_boost_snapshot_capabilities();

-- ---------------------------------------------------------------------------
-- 4) User side: add active_hover_theme to public profile getters
-- (visible only with premium active; same pattern as name style)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_user_profile_by_id(
  p_user_id uuid,
  p_include_social_links boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row public.users%rowtype;
  v_access record;
  v_can_view_social_links boolean := false;
  v_is_premium_active boolean := false;
  v_visible_background_type text := null;
begin
  if p_user_id is null then
    return null;
  end if;

  select *
  into v_row
  from public.users
  where id = p_user_id
    and coalesce(is_active, true) = true
    and coalesce(is_banned, false) = false
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into v_access
  from public.get_profile_view_access(v_row.id)
  limit 1;

  if coalesce(v_access.profile_visible, false) = false then
    return null;
  end if;

  if p_include_social_links then
    v_can_view_social_links := coalesce(v_access.social_links_visible, false);
  end if;

  v_is_premium_active := v_row.premium_expires_at is not null and v_row.premium_expires_at > now();
  v_visible_background_type := app_private.visible_profile_background_type(v_row.background_type, v_row.premium_expires_at);

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_visible_background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'active_fansub_identity_tag', app_private.resolve_user_active_fansub_identity_tag(v_row.id),
    'is_premium_active', v_is_premium_active,
    'active_name_style', case
      when v_is_premium_active then v_row.owned_items -> 'active_name_style'
      else null
    end,
    'active_name_effect', case
      when v_is_premium_active then v_row.owned_items ->> 'active_name_effect'
      else null
    end,
    'active_hover_theme', case
      when v_is_premium_active and app_private.is_valid_hover_theme(v_row.owned_items -> 'active_hover_theme')
        then v_row.owned_items -> 'active_hover_theme'
      else null
    end,
    'social_links', case
      when v_can_view_social_links then coalesce(v_row.social_links, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'created_at', v_row.created_at
  );
end;
$function$;

create or replace function public.get_public_user_profile_by_username(
  p_username text,
  p_include_social_links boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_normalized_username text := nullif(btrim(coalesce(p_username, '')), '');
  v_row public.users%rowtype;
  v_access record;
  v_can_view_social_links boolean := false;
  v_is_premium_active boolean := false;
  v_visible_background_type text := null;
begin
  if v_normalized_username is null then
    return null;
  end if;

  select *
  into v_row
  from public.users
  where username = v_normalized_username
    and coalesce(is_active, true) = true
    and coalesce(is_banned, false) = false
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into v_access
  from public.get_profile_view_access(v_row.id)
  limit 1;

  if coalesce(v_access.profile_visible, false) = false then
    return null;
  end if;

  if p_include_social_links then
    v_can_view_social_links := coalesce(v_access.social_links_visible, false);
  end if;

  v_is_premium_active := v_row.premium_expires_at is not null and v_row.premium_expires_at > now();
  v_visible_background_type := app_private.visible_profile_background_type(v_row.background_type, v_row.premium_expires_at);

  return jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'level', v_row.level,
    'frame_type', v_row.frame_type,
    'background_type', v_visible_background_type,
    'active_profile_effect_id', v_row.active_profile_effect_id,
    'active_fansub_identity_tag', app_private.resolve_user_active_fansub_identity_tag(v_row.id),
    'is_premium_active', v_is_premium_active,
    'active_name_style', case
      when v_is_premium_active then v_row.owned_items -> 'active_name_style'
      else null
    end,
    'active_name_effect', case
      when v_is_premium_active then v_row.owned_items ->> 'active_name_effect'
      else null
    end,
    'active_hover_theme', case
      when v_is_premium_active and app_private.is_valid_hover_theme(v_row.owned_items -> 'active_hover_theme')
        then v_row.owned_items -> 'active_hover_theme'
      else null
    end,
    'social_links', case
      when v_can_view_social_links then coalesce(v_row.social_links, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'created_at', v_row.created_at
  );
end;
$function$;

grant execute on function public.get_public_user_profile_by_id(uuid, boolean) to anon, authenticated;
grant execute on function public.get_public_user_profile_by_username(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) update_my_profile_customization: a premium-gated active_hover_theme key
-- was added to the owned_items patch. The body matches the last definition in migration
-- 20260331_132; only the hover theme block was added (same pattern as name style).
-- This function is on the sensitive-update guard whitelist so it can write owned_items;
-- a separate RPC would have been blocked by the guard.
-- ---------------------------------------------------------------------------
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
  v_patch_active_hover_theme jsonb;
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

    if v_is_premium_active and p_owned_items_patch ? 'active_hover_theme' then
      v_patch_active_hover_theme := p_owned_items_patch -> 'active_hover_theme';
      if v_patch_active_hover_theme is null or jsonb_typeof(v_patch_active_hover_theme) = 'null' then
        v_owned := v_owned - 'active_hover_theme';
      elsif app_private.is_valid_hover_theme(v_patch_active_hover_theme) then
        v_owned := jsonb_set(v_owned, '{active_hover_theme}', jsonb_build_object(
          'version', 1,
          'mainColor', lower(v_patch_active_hover_theme ->> 'mainColor'),
          'accentColor', lower(v_patch_active_hover_theme ->> 'accentColor')
        ), true);
      else
        raise exception 'active_hover_theme gecersiz: mainColor ve accentColor #rrggbb formatinda olmalidir.';
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

-- ---------------------------------------------------------------------------
-- 6) upsert_fansub_profile: p_hover_theme parameter.
-- The body matches the last definition in migration 20260415_179; hover theme validation
-- and the canUseHoverTheme boost capability gate were added.
-- The old signature is dropped, otherwise a PostgREST overload conflict arises.
-- ---------------------------------------------------------------------------
drop function if exists public.upsert_fansub_profile(uuid, text, text, text, text, text, text, text, jsonb, text, uuid);

create or replace function public.upsert_fansub_profile(
  p_fansub_id uuid default null,
  p_name text default null,
  p_slug text default null,
  p_description text default null,
  p_discord_invite_url text default null,
  p_avatar_url text default null,
  p_primary_color text default null,
  p_secondary_color text default null,
  p_active_name_style jsonb default null,
  p_custom_background_asset_url text default null,
  p_active_background_id uuid default null,
  p_hover_theme jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_is_insert boolean := p_fansub_id is null;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_discord_invite_url text := nullif(trim(coalesce(p_discord_invite_url, '')), '');
  v_avatar_url text := nullif(trim(coalesce(p_avatar_url, '')), '');
  v_primary_color text := nullif(trim(coalesce(p_primary_color, '')), '');
  v_secondary_color text := nullif(trim(coalesce(p_secondary_color, '')), '');
  v_hover_theme jsonb := null;
  v_can_use_hover_theme boolean := false;
  v_row public.fansubs%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Kullanici oturumu bulunamadi.';
  end if;

  if v_is_insert then
    if not public.is_admin() then
      raise exception 'Yeni fansub kaydi sadece site admini tarafindan acilabilir.';
    end if;
  elsif not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansub profili icin guncelleme yetkiniz yok.';
  end if;

  if v_name is null or char_length(v_name) < 3 or char_length(v_name) > 32 then
    raise exception 'Fansub adi 3 ile 32 karakter arasinda olmali.';
  end if;

  if v_slug = '' then
    raise exception 'Fansub slug bos olamaz.';
  end if;

  if char_length(v_slug) < 3 or char_length(v_slug) > 40 then
    raise exception 'Fansub slug 3 ile 40 karakter arasinda olmali.';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Fansub slug yalnizca kucuk harf, rakam ve tire icerebilir.';
  end if;

  if v_slug = any (array['yonet', 'manga', 'bolum', 'ekle', 'tier']) then
    raise exception 'Bu slug ayrilmis rota tarafindan kullaniliyor.';
  end if;

  if v_description is not null and char_length(v_description) > 150 then
    raise exception 'Fansub aciklamasi en fazla 150 karakter olabilir.';
  end if;

  if v_discord_invite_url is not null and v_discord_invite_url !~* '^https?://' then
    raise exception 'Discord davet baglantisi gecerli bir URL olmali.';
  end if;

  if v_primary_color is not null and v_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Ana renk hex formatinda olmali.';
  end if;

  if v_secondary_color is not null and v_secondary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Ikinci renk hex formatinda olmali.';
  end if;

  if p_active_name_style is not null and jsonb_typeof(p_active_name_style) <> 'object' then
    raise exception 'active_name_style object olmali.';
  end if;

  if p_custom_background_asset_url is not null and p_active_background_id is not null then
    raise exception 'Statik yukleme ve envanter arka plani ayni anda aktif olamaz.';
  end if;

  if p_hover_theme is not null and jsonb_typeof(p_hover_theme) <> 'null' then
    if not app_private.is_valid_hover_theme(p_hover_theme) then
      raise exception 'Hover temasi gecersiz: mainColor ve accentColor #rrggbb formatinda olmalidir.';
    end if;

    if not public.is_admin() and not v_is_insert then
      select coalesce((s.capabilities ->> 'canUseHoverTheme')::boolean, false)
      into v_can_use_hover_theme
      from public.fansub_boost_snapshots s
      where s.fansub_id = p_fansub_id;

      if not coalesce(v_can_use_hover_theme, false) then
        raise exception 'Hover temasi icin yeterli takviye seviyesi gerekir.';
      end if;
    end if;

    v_hover_theme := jsonb_build_object(
      'version', 1,
      'mainColor', lower(p_hover_theme ->> 'mainColor'),
      'accentColor', lower(p_hover_theme ->> 'accentColor')
    );
  end if;

  if v_is_insert then
    insert into public.fansubs (
      name,
      slug,
      description,
      discord_invite_url,
      avatar_url,
      primary_color,
      secondary_color,
      active_name_style,
      custom_background_asset_url,
      active_background_id,
      hover_theme
    )
    values (
      v_name,
      v_slug,
      v_description,
      v_discord_invite_url,
      v_avatar_url,
      v_primary_color,
      v_secondary_color,
      p_active_name_style,
      p_custom_background_asset_url,
      p_active_background_id,
      v_hover_theme
    )
    returning *
    into v_row;
  else
    select *
    into v_row
    from public.fansubs f
    where f.id = p_fansub_id
    for update;

    if not found then
      raise exception 'Fansub bulunamadi.';
    end if;

    update public.fansubs f
    set
      name = v_name,
      slug = v_slug,
      description = v_description,
      discord_invite_url = v_discord_invite_url,
      avatar_url = v_avatar_url,
      primary_color = v_primary_color,
      secondary_color = v_secondary_color,
      active_name_style = p_active_name_style,
      custom_background_asset_url = p_custom_background_asset_url,
      active_background_id = p_active_background_id,
      hover_theme = v_hover_theme,
      updated_at = now()
    where f.id = p_fansub_id
    returning *
    into v_row;
  end if;

  perform public.create_fansub_audit_log(
    v_row.id,
    'fansub.profile.upsert',
    'fansub',
    v_row.id::text,
    format('%s fansub profili merkezi RPC uzerinden kaydedildi.', v_row.name),
    jsonb_build_object(
      'fansubId', v_row.id,
      'slug', v_row.slug,
      'isInsert', v_is_insert
    )
  );

  if public.is_admin() then
    begin
      perform public.create_admin_audit_log(
        'fansub.profile.upsert',
        'fansub',
        v_row.id::text,
        format('%s fansub profili merkezi RPC uzerinden kaydedildi.', v_row.name),
        jsonb_build_object(
          'fansubId', v_row.id,
          'slug', v_row.slug,
          'isInsert', v_is_insert
        )
      );
    exception
      when others then
        null;
    end;
  end if;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.upsert_fansub_profile(uuid, text, text, text, text, text, text, text, jsonb, text, uuid, jsonb) to authenticated;

commit;
