-- ============================================
-- MangaZone | Runtime Feature Guards
-- Date: 2026-02-14
-- ============================================

begin;

-- Features that the client must read at runtime must be public.
update public.feature_flags
set is_public = true
where key in (
  'economy.coin_codes',
  'economy.fansub_wallet_purchase',
  'notifications.center'
);

-- ============================================
-- Guard: redeem coin code
-- ============================================
create or replace function public.redeem_coin_code(
  p_code text,
  p_target_type text default 'user',
  p_fansub_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_public_user_id uuid;
  v_target text;
  v_code public.redeem_codes%rowtype;
  v_new_balance integer;
  v_fansub public.fansubs%rowtype;
begin
  if not public.is_feature_enabled('economy.coin_codes', true) then
    raise exception 'Coin kodu aktivasyonu su anda gecici olarak kapali.';
  end if;

  v_public_user_id := public.current_public_user_id();
  if v_public_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  v_target := lower(coalesce(trim(p_target_type), 'user'));
  if v_target not in ('user', 'fansub') then
    raise exception 'Gecersiz hedef tipi.';
  end if;

  if p_code is null or trim(p_code) = '' then
    raise exception 'Kod bos olamaz.';
  end if;

  select *
  into v_code
  from public.redeem_codes
  where upper(code) = upper(trim(p_code))
    and is_active = true
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Gecersiz veya suresi dolmus kod.';
  end if;

  if v_code.used_count >= v_code.max_uses then
    raise exception 'Bu kod kullanim limitine ulasmis.';
  end if;

  if v_target = 'user' then
    if v_code.target_type not in ('user', 'both') then
      raise exception 'Bu kod kisisel bakiye icin kullanilamaz.';
    end if;

    insert into public.user_code_redemptions (
      user_id,
      code_id,
      redeemed_at
    )
    values (
      v_public_user_id,
      v_code.id,
      now()
    );

    update public.redeem_codes
    set used_count = used_count + 1
    where id = v_code.id;

    update public.users
    set stones = stones + v_code.value
    where id = v_public_user_id
    returning stones into v_new_balance;

    return jsonb_build_object(
      'success', true,
      'target_type', 'user',
      'code_id', v_code.id,
      'code', v_code.code,
      'credited_value', v_code.value,
      'new_balance', v_new_balance,
      'redeemed_at', now()
    );
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub secimi zorunlu.';
  end if;

  if v_code.target_type not in ('fansub', 'both') then
    raise exception 'Bu kod fansub kasasi icin kullanilamaz.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu fansub icin yetkiniz yok.';
  end if;

  insert into public.fansub_code_redemptions (
    fansub_id,
    code_id,
    redeemed_by,
    redeemed_at
  )
  values (
    p_fansub_id,
    v_code.id,
    v_public_user_id,
    now()
  );

  update public.redeem_codes
  set used_count = used_count + 1
  where id = v_code.id;

  update public.fansubs
  set coin_balance = coin_balance + v_code.value
  where id = p_fansub_id
  returning * into v_fansub;

  insert into public.fansub_transactions (
    fansub_id,
    amount,
    type,
    description,
    created_by
  )
  values (
    p_fansub_id,
    v_code.value,
    'redeem',
    format('Kod kullanimi: %s', v_code.code),
    v_public_user_id
  );

  return jsonb_build_object(
    'success', true,
    'target_type', 'fansub',
    'code_id', v_code.id,
    'code', v_code.code,
    'credited_value', v_code.value,
    'fansub_id', v_fansub.id,
    'new_balance', coalesce(v_fansub.coin_balance, 0),
    'redeemed_at', now()
  );
exception
  when unique_violation then
    if v_target = 'user' then
      raise exception 'Bu kodu zaten kullandiniz.';
    end if;
    raise exception 'Bu kod bu fansub tarafindan zaten kullanildi.';
end;
$$;

grant execute on function public.redeem_coin_code(text, text, uuid) to authenticated;

-- ============================================
-- Guard: fansub wallet purchase
-- ============================================
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
  if not public.is_feature_enabled('economy.fansub_wallet_purchase', true) then
    raise exception 'Fansub kasasi ile satin alma su anda gecici olarak kapali.';
  end if;

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
  if not public.is_feature_enabled('economy.fansub_wallet_purchase', true) then
    raise exception 'Fansub icin satin alma su anda gecici olarak kapali.';
  end if;

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

