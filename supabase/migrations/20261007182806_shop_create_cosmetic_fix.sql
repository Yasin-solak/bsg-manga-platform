-- Shop Control "Yeni kozmetik yukle" errored every time:
-- 1) store_items.description is NOT NULL (default ''), the function explicitly wrote NULL on an empty description
-- ("null value in column description"); no cosmetic including frames could form.
-- 2) store_profile_effect_assets.card_loop_asset_url is NOT NULL, the function never wrote it.
-- Also effect media info (media_meta) and layout (effect_manifest) were not saved; with an empty
-- manifest the client fell to the old template and drew the layer with 'screen' (dark tones on a transparent PNG
-- vanished). Now both come from the client (only a JSON object is accepted).
-- Row shape matches the old effect tool: profile/hover asset = poster, card/profile/hover loop = animation.

create or replace function public.shop_admin_create_cosmetic(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_type text := p ->> 'type';
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_identifier text;
  v_poster text := nullif(p ->> 'posterUrl', '');
  v_profile text := nullif(p ->> 'profileUrl', '');
  v_loop text;
begin
  perform app_private.shop_assert_admin();
  if v_type not in ('frame', 'background', 'profile_effect') then
    raise exception 'Gecersiz kozmetik turu.';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Kozmetik adi 1-80 karakter olmali.';
  end if;
  if nullif(p ->> 'assetUrl', '') is null and v_poster is null then
    raise exception 'En az bir gorsel gerekli.';
  end if;
  if v_type = 'profile_effect' and (v_poster is null or v_profile is null) then
    raise exception 'Profil efekti icin poster ve profil animasyonu gerekli.';
  end if;

  v_identifier := left(regexp_replace(regexp_replace(lower(coalesce(nullif(p ->> 'identifier', ''), v_name)), '[^a-z0-9-]+', '-', 'g'), '(^-+|-+$)', '', 'g'), 48)
    || '-' || substr(md5(gen_random_uuid()::text), 1, 6);

  insert into public.store_items (name, description, identifier, type, price, currency, custom_asset_url, poster_asset_url, is_active, theme_name)
  values (v_name, btrim(coalesce(p ->> 'description', '')), v_identifier, v_type, 0, 'Coin',
    nullif(p ->> 'assetUrl', ''), v_poster, false, nullif(p ->> 'theme', ''))
  returning id into v_id;

  if v_type = 'profile_effect' then
    v_loop := coalesce(nullif(p ->> 'hoverUrl', ''), v_profile);
    insert into public.store_profile_effect_assets (
      item_id, poster_asset_url, card_loop_asset_url, profile_asset_url, profile_loop_asset_url,
      hover_asset_url, hover_loop_asset_url, media_meta, effect_manifest, is_active
    )
    values (
      v_id, v_poster, v_loop, v_poster, v_profile, v_poster, v_loop,
      case when jsonb_typeof(p -> 'mediaMeta') = 'object' then p -> 'mediaMeta' else '{}'::jsonb end,
      case when jsonb_typeof(p -> 'effectManifest') = 'object' then p -> 'effectManifest' else '{}'::jsonb end,
      true
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.shop_admin_create_cosmetic(jsonb) from public;
grant execute on function public.shop_admin_create_cosmetic(jsonb) to authenticated;
