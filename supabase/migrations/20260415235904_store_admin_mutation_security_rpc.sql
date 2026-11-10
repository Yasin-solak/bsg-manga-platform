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

create or replace function public.admin_set_store_item_active_state(
  p_item_id uuid,
  p_is_active boolean
)
returns table (
  id uuid,
  is_active boolean,
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
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if p_item_id is null then
    raise exception 'Urun secimi zorunludur.';
  end if;

  select *
  into v_previous
  from public.store_items si
  where si.id = p_item_id
  for update;

  if not found then
    raise exception 'Urun bulunamadi.';
  end if;

  update public.store_items si
  set is_active = coalesce(p_is_active, false)
  where si.id = p_item_id
  returning * into v_row;

  perform public.create_admin_audit_log(
    'store_item.active_state.update',
    'store_item',
    v_row.id::text,
    format('%s urununun durumu %s yapildi.', v_row.name, case when v_row.is_active then 'aktif' else 'pasif' end),
    jsonb_build_object(
      'previousIsActive', v_previous.is_active,
      'nextIsActive', v_row.is_active,
      'identifier', v_row.identifier,
      'type', v_row.type
    )
  );

  return query
  select
    v_row.id,
    v_row.is_active,
    v_row.updated_at;
end;
$$;

revoke all on function public.admin_set_store_item_active_state(uuid, boolean) from public;
grant execute on function public.admin_set_store_item_active_state(uuid, boolean) to authenticated;

create or replace function public.admin_set_store_item_pricing(
  p_item_id uuid,
  p_price integer,
  p_original_price integer default null
)
returns table (
  id uuid,
  price integer,
  original_price integer,
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
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if p_item_id is null then
    raise exception 'Urun secimi zorunludur.';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'Fiyat negatif olamaz.';
  end if;

  if p_original_price is not null and p_original_price < 0 then
    raise exception 'Orijinal fiyat negatif olamaz.';
  end if;

  select *
  into v_previous
  from public.store_items si
  where si.id = p_item_id
  for update;

  if not found then
    raise exception 'Urun bulunamadi.';
  end if;

  update public.store_items si
  set
    price = p_price,
    original_price = p_original_price
  where si.id = p_item_id
  returning * into v_row;

  perform public.create_admin_audit_log(
    'store_item.pricing.update',
    'store_item',
    v_row.id::text,
    format('%s urununun fiyati guncellendi.', v_row.name),
    jsonb_build_object(
      'previousPrice', v_previous.price,
      'nextPrice', v_row.price,
      'previousOriginalPrice', v_previous.original_price,
      'nextOriginalPrice', v_row.original_price,
      'identifier', v_row.identifier,
      'type', v_row.type
    )
  );

  return query
  select
    v_row.id,
    v_row.price,
    v_row.original_price,
    v_row.updated_at;
end;
$$;

revoke all on function public.admin_set_store_item_pricing(uuid, integer, integer) from public;
grant execute on function public.admin_set_store_item_pricing(uuid, integer, integer) to authenticated;

create or replace function public.admin_delete_store_item(
  p_item_id uuid
)
returns table (
  id uuid,
  name text,
  type text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
  v_row public.store_items%rowtype;
  v_fansub_inventory_count bigint := 0;
  v_fansub_purchase_tx_count bigint := 0;
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekli.';
  end if;

  if p_item_id is null then
    raise exception 'Urun secimi zorunludur.';
  end if;

  select *
  into v_row
  from public.store_items si
  where si.id = p_item_id
  for update;

  if not found then
    raise exception 'Urun bulunamadi.';
  end if;

  if coalesce(v_row.purchase_count, 0) > 0 then
    raise exception 'Bu urun daha once satin alinmis. Envanter ve profil tutarliligi icin kalici silme engellendi. Urunu pasif yapin.';
  end if;

  select count(*)
  into v_fansub_inventory_count
  from public.fansub_inventory fi
  where fi.store_item_id = p_item_id;

  if coalesce(v_fansub_inventory_count, 0) > 0 then
    raise exception 'Bu urun en az bir fansub envanterinde bulunuyor. Kalici silme engellendi; once envanter baglantilarini temizleyin veya urunu pasif yapin.';
  end if;

  select count(*)
  into v_fansub_purchase_tx_count
  from public.fansub_transactions ft
  where ft.type = 'purchase'
    and ft.related_item_id = p_item_id;

  if coalesce(v_fansub_purchase_tx_count, 0) > 0 then
    raise exception 'Bu urun icin satin alim gecmisi var. Raporlama butunlugu icin kalici silme engellendi. Urunu pasif yapin.';
  end if;

  delete from public.store_items si
  where si.id = p_item_id;

  perform public.create_admin_audit_log(
    'store_item.delete',
    'store_item',
    v_row.id::text,
    format('%s magazadan silindi.', v_row.name),
    jsonb_build_object(
      'identifier', v_row.identifier,
      'type', v_row.type,
      'price', v_row.price,
      'originalPrice', v_row.original_price,
      'purchaseCount', v_row.purchase_count
    )
  );

  return query
  select
    v_row.id,
    v_row.name,
    v_row.type;
end;
$$;

revoke all on function public.admin_delete_store_item(uuid) from public;
grant execute on function public.admin_delete_store_item(uuid) to authenticated;

commit;
