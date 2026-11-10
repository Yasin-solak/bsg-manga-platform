-- ============================================
-- MangaZone | Sensitive User Update Bypass + Fansub Store Purchase RPC
-- Date: 2026-02-14
-- ============================================

begin;

-- ============================================
-- Allow trusted RPCs to update sensitive user fields
-- ============================================
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

  -- Note: ALTER FUNCTION ... SET custom parameter permission is limited on Supabase.
  -- So we recognize the trusted RPC call chain via the call stack.
  v_allow_sensitive := (
    v_context ~* 'function[[:space:]]+(public\.)?purchase_store_item[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_user_badge[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_badge[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?redeem_coin_code[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?claim_user_reward_task[[:space:]]*\('
    or v_context ~* 'function[[:space:]]+(public\.)?purchase_fansub_store_item_with_user_wallet[[:space:]]*\('
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

  return new;
end;
$$;

-- ============================================
-- Fansub store purchase using caller user wallet (atomic)
-- ============================================
create or replace function public.purchase_fansub_store_item_with_user_wallet(
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
  v_user public.users%rowtype;
  v_fansub public.fansubs%rowtype;
  v_item public.store_items%rowtype;
  v_new_stones integer;
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
  into v_user
  from public.users
  where id = v_caller_id
  for update;

  if not found then
    raise exception 'Kullanici profili bulunamadi.';
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

  if v_user.stones < v_item.price then
    raise exception 'Yetersiz kullanici bakiyesi.';
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
    store_item_id
  )
  values (
    p_fansub_id,
    p_item_id
  );

  v_new_stones := v_user.stones - v_item.price;

  update public.users
  set stones = v_new_stones
  where id = v_caller_id;

  update public.store_items
  set purchase_count = purchase_count + 1
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
    0,
    'purchase',
    format('Uye tarafindan satin alim (deger: %s)', v_item.price),
    p_item_id,
    v_caller_id
  );

  return jsonb_build_object(
    'success', true,
    'fansub_id', p_fansub_id,
    'item_id', p_item_id,
    'price', v_item.price,
    'new_user_stones', v_new_stones
  );
exception
  when unique_violation then
    raise exception 'Bu urun zaten fansub envanterinde bulunuyor.';
end;
$$;

revoke all on function public.purchase_fansub_store_item_with_user_wallet(uuid, uuid) from public;
grant execute on function public.purchase_fansub_store_item_with_user_wallet(uuid, uuid) to authenticated;

commit;
