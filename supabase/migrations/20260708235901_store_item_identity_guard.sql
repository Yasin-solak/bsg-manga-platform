-- Shop product identity guard:
-- owned_items inventory is kept by identifier string, so changing the identifier
-- or type of a distributed (bought / gifted / in inventory) product
-- silently breaks ownership:
-- isOwned returns false (double purchase risk), inventoryResolver falls to a raw
-- string. The delete side already had a purchase_count > 0 guard;
-- the same protection is added for rename/retype.
-- Also: changing the type of a product tied to a bundle breaks the bundle setup,
-- blocked regardless of distribution.

begin;

create or replace function public.admin_upsert_store_item(
  p_item_id uuid default null,
  p_name text default '',
  p_description text default '',
  p_identifier text default '',
  p_type text default '',
  p_price integer default 0,
  p_original_price integer default null,
  p_currency text default 'Coin',
  p_image_key text default null,
  p_custom_asset_url text default null,
  p_poster_asset_url text default null,
  p_theme_name text default null,
  p_is_active boolean default true
)
returns table (
  id uuid,
  name text,
  description text,
  identifier text,
  type text,
  price integer,
  original_price integer,
  currency text,
  image_key text,
  custom_asset_url text,
  poster_asset_url text,
  theme_name text,
  is_active boolean,
  created_at timestamptz,
  purchase_count integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_previous public.store_items%rowtype;
  v_row public.store_items%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_description text := coalesce(trim(p_description), '');
  v_identifier text := trim(coalesce(p_identifier, ''));
  v_type text := lower(trim(coalesce(p_type, '')));
  v_currency text := case
    when upper(trim(coalesce(p_currency, 'Coin'))) = 'TL' then 'TL'
    else 'Coin'
  end;
  v_theme_name text := nullif(trim(coalesce(p_theme_name, '')), '');
  v_is_insert boolean := p_item_id is null;
  v_identity_changed boolean := false;
  v_has_distribution boolean := false;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if v_name = '' then
    raise exception 'Urun adi zorunludur.';
  end if;

  if v_identifier = '' then
    raise exception 'Urun identifier alani zorunludur.';
  end if;

  if v_type not in ('frame', 'badge', 'premium', 'pattern', 'background', 'profile_effect') then
    raise exception 'Gecersiz urun tipi.';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'Fiyat negatif olamaz.';
  end if;

  if p_original_price is not null and p_original_price < 0 then
    raise exception 'Orijinal fiyat negatif olamaz.';
  end if;

  if v_type in ('frame', 'background', 'profile_effect') and v_theme_name is null then
    raise exception 'Bu urun tipi icin tema zorunludur.';
  end if;

  if not v_is_insert then
    select *
    into v_previous
    from public.store_items si
    where si.id = p_item_id
    for update;

    if not found then
      raise exception 'Urun bulunamadi.';
    end if;

    v_identity_changed := v_previous.identifier <> v_identifier or v_previous.type <> v_type;

    if v_identity_changed then
      v_has_distribution := coalesce(v_previous.purchase_count, 0) > 0
        or exists (
          select 1
          from public.user_inventory_items ui
          where ui.store_item_id = p_item_id
        )
        or exists (
          select 1
          from public.fansub_inventory fi
          where fi.store_item_id = p_item_id
        )
        or exists (
          select 1
          from public.store_item_gifts g
          where g.store_item_id = p_item_id
        );

      if v_has_distribution then
        raise exception 'Bu urun satin alinmis veya envanterlere dagitilmis: identifier/tip degistirilemez. Envanter tutarliligi icin urunu pasif yapip yeni urun olusturun.';
      end if;
    end if;

    if v_previous.type <> v_type
      and exists (
        select 1
        from public.store_cosmetic_packages pkg
        where pkg.frame_store_item_id = p_item_id
          or pkg.profile_effect_store_item_id = p_item_id
      )
    then
      raise exception 'Bu urun bir kozmetik pakete bagli: tip degisikligi paket kurgusunu bozar. Once paketi guncelleyin.';
    end if;
  end if;

  if v_is_insert then
    insert into public.store_items (
      name,
      description,
      identifier,
      type,
      price,
      original_price,
      currency,
      image_key,
      custom_asset_url,
      poster_asset_url,
      theme_name,
      is_active
    )
    values (
      v_name,
      v_description,
      v_identifier,
      v_type,
      p_price,
      p_original_price,
      v_currency,
      nullif(trim(coalesce(p_image_key, '')), ''),
      nullif(trim(coalesce(p_custom_asset_url, '')), ''),
      nullif(trim(coalesce(p_poster_asset_url, '')), ''),
      v_theme_name,
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.store_items si
    set
      name = v_name,
      description = v_description,
      identifier = v_identifier,
      type = v_type,
      price = p_price,
      original_price = p_original_price,
      currency = v_currency,
      image_key = nullif(trim(coalesce(p_image_key, '')), ''),
      custom_asset_url = nullif(trim(coalesce(p_custom_asset_url, '')), ''),
      poster_asset_url = nullif(trim(coalesce(p_poster_asset_url, '')), ''),
      theme_name = v_theme_name,
      is_active = coalesce(p_is_active, true)
    where si.id = p_item_id
    returning * into v_row;
  end if;

  perform public.create_admin_audit_log(
    case when v_is_insert then 'store_item.create' else 'store_item.update' end,
    'store_item',
    v_row.id::text,
    case
      when v_is_insert then format('%s magazaya eklendi.', v_row.name)
      else format('%s magazada guncellendi.', v_row.name)
    end,
    jsonb_build_object(
      'type', v_row.type,
      'identifier', v_row.identifier,
      'price', v_row.price,
      'originalPrice', v_row.original_price,
      'currency', v_row.currency,
      'isActive', v_row.is_active,
      'previous', case
        when v_is_insert then null
        else jsonb_build_object(
          'name', v_previous.name,
          'description', v_previous.description,
          'identifier', v_previous.identifier,
          'type', v_previous.type,
          'price', v_previous.price,
          'originalPrice', v_previous.original_price,
          'currency', v_previous.currency,
          'isActive', v_previous.is_active
        )
      end
    )
  );

  return query
  select
    v_row.id,
    v_row.name,
    v_row.description,
    v_row.identifier,
    v_row.type,
    v_row.price,
    v_row.original_price,
    v_row.currency,
    v_row.image_key,
    v_row.custom_asset_url,
    v_row.poster_asset_url,
    v_row.theme_name,
    v_row.is_active,
    v_row.created_at,
    v_row.purchase_count,
    v_row.updated_at;
end;
$$;

revoke all on function public.admin_upsert_store_item(uuid, text, text, text, text, integer, integer, text, text, text, text, text, boolean) from public;
grant execute on function public.admin_upsert_store_item(uuid, text, text, text, text, integer, integer, text, text, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
