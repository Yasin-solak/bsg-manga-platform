-- ============================================
-- MangaZone | Fansub Donation RPC
-- Date: 2026-03-05
-- ============================================

begin;

alter table public.fansub_transactions
  drop constraint if exists fansub_transactions_type_check;

alter table public.fansub_transactions
  add constraint fansub_transactions_type_check
  check (type in ('redeem', 'purchase', 'reward_view', 'reward_rank', 'reward_task', 'donation', 'system'));

insert into public.feature_flags (
  key,
  label,
  description,
  is_enabled,
  rollout_percent,
  is_public,
  metadata
)
values (
  'economy.fansub_donations',
  'Fansub Bagis Sistemi',
  'Kullanicilarin fansublara coin bagisi yapmasini ac/kapat.',
  true,
  100,
  true,
  '{}'::jsonb
)
on conflict (key) do update
set label = excluded.label,
    description = excluded.description,
    is_enabled = excluded.is_enabled,
    rollout_percent = excluded.rollout_percent,
    is_public = excluded.is_public,
    metadata = excluded.metadata;

create or replace function public.donate_to_fansub(
  p_fansub_id uuid,
  p_amount integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user public.users%rowtype;
  v_fansub public.fansubs%rowtype;
  v_amount integer;
  v_note text;
  v_description text;
  v_new_user_stones integer;
  v_new_fansub_balance integer;
begin
  if not public.is_feature_enabled('economy.fansub_donations', false) then
    raise exception 'Fansub bagis sistemi su anda gecici olarak kapali.';
  end if;

  v_user_id := public.current_public_user_id();
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub secimi zorunludur.';
  end if;

  v_amount := coalesce(p_amount, 0);
  if v_amount <= 0 then
    raise exception 'Bagis tutari sifirdan buyuk olmalidir.';
  end if;

  if v_amount > 100000 then
    raise exception 'Tek seferde en fazla 100000 coin bagis yapabilirsiniz.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Kullanici profili bulunamadi.';
  end if;

  if coalesce(v_user.is_active, true) = false then
    raise exception 'Pasif hesap ile bagis yapamazsiniz.';
  end if;

  if coalesce(v_user.is_banned, false) = true then
    raise exception 'Bu islem icin hesabinizin aktif olmasi gerekir.';
  end if;

  if coalesce(v_user.stones, 0) < v_amount then
    raise exception 'Yetersiz coin bakiyesi.';
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
    raise exception 'Bu fansub su anda bagis kabul etmiyor.';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 140);
    v_description := format('Kullanici bagisi (+%s coin) - %s', v_amount, v_note);
  else
    v_description := format('Kullanici bagisi (+%s coin)', v_amount);
  end if;

  v_new_user_stones := coalesce(v_user.stones, 0) - v_amount;
  v_new_fansub_balance := coalesce(v_fansub.coin_balance, 0) + v_amount;

  update public.users
  set stones = v_new_user_stones
  where id = v_user_id;

  update public.fansubs
  set coin_balance = v_new_fansub_balance
  where id = v_fansub.id;

  insert into public.fansub_transactions (
    fansub_id,
    amount,
    type,
    description,
    related_item_id,
    created_by,
    created_at
  )
  values (
    v_fansub.id,
    v_amount,
    'donation',
    v_description,
    null,
    v_user_id,
    now()
  );

  return jsonb_build_object(
    'success', true,
    'fansub_id', v_fansub.id,
    'amount', v_amount,
    'new_user_stones', v_new_user_stones,
    'new_fansub_balance', v_new_fansub_balance
  );
end;
$$;

revoke all on function public.donate_to_fansub(uuid, integer, text) from public;
grant execute on function public.donate_to_fansub(uuid, integer, text) to authenticated;

commit;