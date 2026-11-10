-- Shop v3: a cosmetic record (store_items) is now only a "definition" (image + identifier); sale state
-- is in shop_products. Therefore:
-- 1) store_items is public: an off-sale but owned frame / background / effect
-- also shows to other users (the old is_active filter hid owners' cosmetics).
-- Old catalog queries already filter is_active explicitly; old purchase RPCs also check
-- is_active on the server.
-- 2) New cosmetics are added from Shop Control (is_active = false: the old purchase path cannot sell them).

drop policy if exists store_items_select_public on public.store_items;
create policy store_items_select_public on public.store_items
  for select to anon, authenticated using (true);

create or replace function public.shop_admin_create_cosmetic(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_type text := p ->> 'type';
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_identifier text;
begin
  perform app_private.shop_assert_admin();
  if v_type not in ('frame', 'background', 'profile_effect') then
    raise exception 'Gecersiz kozmetik turu.';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Kozmetik adi 1-80 karakter olmali.';
  end if;
  if nullif(p ->> 'assetUrl', '') is null and nullif(p ->> 'posterUrl', '') is null then
    raise exception 'En az bir gorsel gerekli.';
  end if;

  v_identifier := left(regexp_replace(regexp_replace(lower(coalesce(nullif(p ->> 'identifier', ''), v_name)), '[^a-z0-9-]+', '-', 'g'), '(^-+|-+$)', '', 'g'), 48)
    || '-' || substr(md5(gen_random_uuid()::text), 1, 6);

  insert into public.store_items (name, description, identifier, type, price, currency, custom_asset_url, poster_asset_url, is_active, theme_name)
  values (v_name, nullif(btrim(coalesce(p ->> 'description', '')), ''), v_identifier, v_type, 0, 'Coin',
    nullif(p ->> 'assetUrl', ''), nullif(p ->> 'posterUrl', ''), false, nullif(p ->> 'theme', ''))
  returning id into v_id;

  if v_type = 'profile_effect' then
    insert into public.store_profile_effect_assets (item_id, poster_asset_url, profile_asset_url, profile_loop_asset_url, hover_asset_url, hover_loop_asset_url, is_active)
    values (v_id, nullif(p ->> 'posterUrl', ''), nullif(p ->> 'profileUrl', ''), nullif(p ->> 'profileUrl', ''),
      nullif(coalesce(p ->> 'hoverUrl', p ->> 'profileUrl'), ''), nullif(coalesce(p ->> 'hoverUrl', p ->> 'profileUrl'), ''), true);
  end if;

  return v_id;
end;
$$;

revoke all on function public.shop_admin_create_cosmetic(jsonb) from public;
grant execute on function public.shop_admin_create_cosmetic(jsonb) to authenticated;
