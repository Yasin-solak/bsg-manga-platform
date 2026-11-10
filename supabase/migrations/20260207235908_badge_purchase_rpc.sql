-- ============================================
-- MangaZone | Badge Purchase RPC (Atomic)
-- Date: 2026-02-07
-- ============================================

create or replace function public.purchase_user_badge(p_badge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_badge public.badges%rowtype;
  v_user public.users%rowtype;
  v_new_stones integer;
begin
  v_caller_id := public.current_public_user_id();
  if v_caller_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  select *
  into v_badge
  from public.badges
  where id = p_badge_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Rozet bulunamadi veya aktif degil.';
  end if;

  if v_badge.category <> 'purchasable' then
    raise exception 'Bu rozet satin alinamaz.';
  end if;

  if v_badge.target_type not in ('user', 'both') then
    raise exception 'Bu rozet kullanici icin satin alinamaz.';
  end if;

  if v_badge.price is null or v_badge.price <= 0 then
    raise exception 'Rozet fiyati gecersiz.';
  end if;

  if exists (
    select 1
    from public.user_badges ub
    where ub.user_id = v_caller_id
      and ub.badge_id = p_badge_id
  ) then
    raise exception 'Bu rozete zaten sahipsiniz.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_caller_id
  for update;

  if not found then
    raise exception 'Kullanici profili bulunamadi.';
  end if;

  if v_user.stones < v_badge.price then
    raise exception 'Yetersiz bakiye.';
  end if;

  v_new_stones := v_user.stones - v_badge.price;

  update public.users
  set stones = v_new_stones
  where id = v_caller_id;

  insert into public.user_badges (
    user_id,
    badge_id,
    is_displayed,
    display_order
  )
  values (
    v_caller_id,
    p_badge_id,
    false,
    0
  );

  return jsonb_build_object(
    'target', 'user',
    'user_id', v_caller_id,
    'badge_id', p_badge_id,
    'price', v_badge.price,
    'new_user_stones', v_new_stones
  );
end;
$$;

revoke all on function public.purchase_user_badge(uuid) from public;
grant execute on function public.purchase_user_badge(uuid) to authenticated;

create or replace function public.purchase_fansub_badge(
  p_fansub_id uuid,
  p_badge_id uuid,
  p_payment_source text default 'fansub'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_badge public.badges%rowtype;
  v_fansub public.fansubs%rowtype;
  v_user public.users%rowtype;
  v_new_fansub_balance integer;
  v_new_user_stones integer;
begin
  v_caller_id := public.current_public_user_id();
  if v_caller_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_payment_source not in ('user', 'fansub') then
    raise exception 'Gecersiz odeme kaynagi.';
  end if;

  if not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    raise exception 'Bu islem icin yetkiniz yok.';
  end if;

  select *
  into v_badge
  from public.badges
  where id = p_badge_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Rozet bulunamadi veya aktif degil.';
  end if;

  if v_badge.category <> 'purchasable' then
    raise exception 'Bu rozet satin alinamaz.';
  end if;

  if v_badge.target_type not in ('fansub', 'both') then
    raise exception 'Bu rozet fansub icin satin alinamaz.';
  end if;

  if v_badge.price is null or v_badge.price <= 0 then
    raise exception 'Rozet fiyati gecersiz.';
  end if;

  if exists (
    select 1
    from public.fansub_badges fb
    where fb.fansub_id = p_fansub_id
      and fb.badge_id = p_badge_id
  ) then
    raise exception 'Fansub bu rozete zaten sahip.';
  end if;

  select *
  into v_fansub
  from public.fansubs
  where id = p_fansub_id
  for update;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  if p_payment_source = 'user' then
    select *
    into v_user
    from public.users
    where id = v_caller_id
    for update;

    if not found then
      raise exception 'Kullanici profili bulunamadi.';
    end if;

    if v_user.stones < v_badge.price then
      raise exception 'Yetersiz bakiye.';
    end if;

    v_new_user_stones := v_user.stones - v_badge.price;

    update public.users
    set stones = v_new_user_stones
    where id = v_caller_id;
  else
    if coalesce(v_fansub.coin_balance, 0) < v_badge.price then
      raise exception 'Fansub bakiyesi yetersiz.';
    end if;

    v_new_fansub_balance := coalesce(v_fansub.coin_balance, 0) - v_badge.price;

    update public.fansubs
    set coin_balance = v_new_fansub_balance
    where id = p_fansub_id;
  end if;

  insert into public.fansub_badges (
    fansub_id,
    badge_id,
    is_displayed,
    display_order
  )
  values (
    p_fansub_id,
    p_badge_id,
    false,
    0
  );

  return jsonb_build_object(
    'target', 'fansub',
    'fansub_id', p_fansub_id,
    'badge_id', p_badge_id,
    'price', v_badge.price,
    'payment_source', p_payment_source,
    'new_user_stones', v_new_user_stones,
    'new_fansub_coin_balance', v_new_fansub_balance
  );
end;
$$;

revoke all on function public.purchase_fansub_badge(uuid, uuid, text) from public;
grant execute on function public.purchase_fansub_badge(uuid, uuid, text) to authenticated;

