-- ============================================
-- MangaZone | Cosmetic bundle purchase from the fansub vault (Part 1 / bundle)
-- purchase_store_package_for_fansub: adds the bundle frame + profile effect to the fansub
-- inventory, debits the price from the fansub vault (coin_balance), writes the ledger.
-- A merge of the existing purchase_fansub_store_item (single product) + purchase_store_package (personal)
-- patterns. Only a fansub admin / site admin can call it.
-- Date: 2026-06-26
-- ============================================

begin;

create or replace function public.purchase_store_package_for_fansub(
  p_fansub_id uuid,
  p_package_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_fansub public.fansubs%rowtype;
  v_package public.store_cosmetic_packages%rowtype;
  v_frame_item public.store_items%rowtype;
  v_effect_item public.store_items%rowtype;
  v_new_balance integer;
begin
  if not public.is_feature_enabled('economy.store_purchase', true) then
    raise exception 'Magaza paket satin alma su anda gecici olarak kapali.';
  end if;
  if not public.is_feature_enabled('economy.fansub_wallet_purchase', true) then
    raise exception 'Fansub kasasi ile satin alma su anda gecici olarak kapali.';
  end if;

  v_caller_id := public.current_public_user_id();
  if v_caller_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null or trim(coalesce(p_package_key, '')) = '' then
    raise exception 'Fansub ve paket secimi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansub icin satin alma yetkiniz yok.';
  end if;

  select *
  into v_fansub
  from public.fansubs
  where id = p_fansub_id
  for update;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  if coalesce(v_fansub.is_active, true) = false then
    raise exception 'Fansub aktif degil.';
  end if;

  select *
  into v_package
  from public.store_cosmetic_packages
  where package_key = trim(p_package_key)
    and is_active = true
  for update;

  if not found then
    raise exception 'Paket bulunamadi veya aktif degil.';
  end if;

  if v_package.currency <> 'Coin' then
    raise exception 'Bu paket Coin ile satin alinmiyor.';
  end if;

  if coalesce(v_fansub.coin_balance, 0) < v_package.price then
    raise exception 'Fansub bakiyesi yetersiz.';
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

  if exists (
    select 1 from public.fansub_inventory fi
    where fi.fansub_id = p_fansub_id and fi.store_item_id = v_frame_item.id
  ) then
    raise exception 'Bu paketin cercevesi zaten fansub envanterinde bulunuyor.';
  end if;

  if exists (
    select 1 from public.fansub_inventory fi
    where fi.fansub_id = p_fansub_id and fi.store_item_id = v_effect_item.id
  ) then
    raise exception 'Bu paketin profil efekti zaten fansub envanterinde bulunuyor.';
  end if;

  insert into public.fansub_inventory (fansub_id, store_item_id, acquired_by)
  values
    (p_fansub_id, v_frame_item.id, v_caller_id),
    (p_fansub_id, v_effect_item.id, v_caller_id);

  v_new_balance := coalesce(v_fansub.coin_balance, 0) - v_package.price;

  update public.fansubs
  set coin_balance = v_new_balance
  where id = p_fansub_id;

  update public.store_items
  set purchase_count = coalesce(purchase_count, 0) + 1
  where id in (v_frame_item.id, v_effect_item.id);

  insert into public.fansub_transactions (
    fansub_id, amount, type, description, related_item_id, created_by
  )
  values (
    p_fansub_id,
    -v_package.price,
    'purchase',
    format('Fansub kasasi ile paket satin alimi (%s)', v_package.package_key),
    v_frame_item.id,
    v_caller_id
  );

  insert into public.store_package_events (
    event_type, actor_user_id, package_key, total_price, granted_item_ids
  )
  values (
    'purchase',
    v_caller_id,
    v_package.package_key,
    v_package.price,
    array[v_frame_item.id, v_effect_item.id]::uuid[]
  );

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'package_key', v_package.package_key,
    'price', v_package.price,
    'new_fansub_balance', v_new_balance,
    'granted_item_ids', jsonb_build_array(v_frame_item.id, v_effect_item.id)
  );
exception
  when unique_violation then
    raise exception 'Bu paketin urunleri zaten fansub envanterinde bulunuyor.';
end;
$$;

revoke all on function public.purchase_store_package_for_fansub(uuid, text) from public;
grant execute on function public.purchase_store_package_for_fansub(uuid, text) to authenticated;

commit;
