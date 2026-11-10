-- ============================================
-- MangaZone | Atomic Fansub Store Purchase RPC
-- Date: 2026-02-14
-- ============================================

begin;

create or replace function public.purchase_fansub_store_item(
  p_fansub_id uuid,
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_fansub public.fansubs%rowtype;
  v_item public.store_items%rowtype;
  v_new_balance integer;
begin
  v_caller_id := public.current_public_user_id();
  if v_caller_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null or p_item_id is null then
    raise exception 'Fansub ve urun secimi zorunludur.';
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

  if coalesce(v_fansub.coin_balance, 0) < v_item.price then
    raise exception 'Fansub bakiyesi yetersiz.';
  end if;

  if exists (
    select 1
    from public.fansub_inventory fi
    where fi.fansub_id = p_fansub_id
      and fi.store_item_id = p_item_id
  ) then
    raise exception 'Bu urun zaten fansub envanterinde bulunuyor.';
  end if;

  insert into public.fansub_inventory (
    fansub_id,
    store_item_id,
    acquired_by
  )
  values (
    p_fansub_id,
    p_item_id,
    v_caller_id
  );

  v_new_balance := coalesce(v_fansub.coin_balance, 0) - v_item.price;

  update public.fansubs
  set coin_balance = v_new_balance
  where id = p_fansub_id;

  update public.store_items
  set purchase_count = coalesce(purchase_count, 0) + 1
  where id = p_item_id;

  insert into public.fansub_transactions (
    fansub_id,
    amount,
    type,
    description,
    related_item_id,
    created_by
  )
  values (
    p_fansub_id,
    -v_item.price,
    'purchase',
    format('Fansub kasasi ile satin alim (urun: %s)', coalesce(v_item.name, p_item_id::text)),
    p_item_id,
    v_caller_id
  );

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'item_id', p_item_id,
    'price', v_item.price,
    'new_fansub_balance', v_new_balance
  );
exception
  when unique_violation then
    raise exception 'Bu urun zaten fansub envanterinde bulunuyor.';
end;
$$;

revoke all on function public.purchase_fansub_store_item(uuid, uuid) from public;
grant execute on function public.purchase_fansub_store_item(uuid, uuid) to authenticated;

commit;
