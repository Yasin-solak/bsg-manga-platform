-- ============================================
-- MangaZone | Atomic Redeem RPC
-- Date: 2026-02-14
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
