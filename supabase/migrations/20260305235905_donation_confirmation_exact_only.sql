-- ============================================
-- MangaZone | Donation Confirmation Exact Text Only
-- Date: 2026-03-05
-- ============================================

begin;

create or replace function public.donate_to_fansub(
  p_fansub_id uuid,
  p_amount integer,
  p_note text default null,
  p_confirmation_text text default null
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
  v_confirmation text;
  v_description text;
  v_new_user_stones integer;
  v_new_fansub_balance integer;
  v_last_donation_at timestamptz;
  v_daily_total integer;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_min_account_age interval := interval '24 hours';
  v_cooldown interval := interval '10 seconds';
  v_daily_limit integer := 250000;
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

  v_confirmation := nullif(regexp_replace(trim(coalesce(p_confirmation_text, '')), '\s+', ' ', 'g'), '');
  if v_confirmation is null then
    raise exception 'Bagis onayi icin sadece ONAYLIYORUM yazmalisiniz.';
  end if;

  if v_confirmation <> 'ONAYLIYORUM' then
    raise exception 'Onay metni hatali. Sadece ONAYLIYORUM yazin.';
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

  if coalesce(v_user.created_at, now()) > now() - v_min_account_age then
    raise exception 'Bagis yapmak icin hesabin en az 24 saatlik olmalidir.';
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

  if exists (
    select 1
    from public.fansub_members fm
    where fm.fansub_id = v_fansub.id
      and fm.user_id = v_user_id
      and fm.role = 'admin'
  ) then
    raise exception 'Kendi yonettiginiz fansuba bagis yapamazsiniz.';
  end if;

  select ft.created_at
  into v_last_donation_at
  from public.fansub_transactions ft
  where ft.created_by = v_user_id
    and ft.type = 'donation'
  order by ft.created_at desc
  limit 1;

  if v_last_donation_at is not null and now() - v_last_donation_at < v_cooldown then
    raise exception 'Cok hizli bagis denemesi. Lutfen birkac saniye bekleyin.';
  end if;

  v_today_start := date_trunc('day', now());
  v_today_end := v_today_start + interval '1 day';

  select coalesce(sum(ft.amount), 0)::integer
  into v_daily_total
  from public.fansub_transactions ft
  where ft.created_by = v_user_id
    and ft.type = 'donation'
    and ft.created_at >= v_today_start
    and ft.created_at < v_today_end;

  if coalesce(v_daily_total, 0) + v_amount > v_daily_limit then
    raise exception 'Gunluk bagis limitini astiniz. Gunluk ust sinir % coin.', v_daily_limit;
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 140);

    if v_note ~* '(https?://|www\.)' then
      raise exception 'Bagis notunda link paylasamazsiniz.';
    end if;

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
    donation_note,
    related_item_id,
    created_by,
    created_at
  )
  values (
    v_fansub.id,
    v_amount,
    'donation',
    v_description,
    v_note,
    null,
    v_user_id,
    now()
  );

  return jsonb_build_object(
    'success', true,
    'fansub_id', v_fansub.id,
    'amount', v_amount,
    'note', v_note,
    'new_user_stones', v_new_user_stones,
    'new_fansub_balance', v_new_fansub_balance
  );
end;
$$;

revoke all on function public.donate_to_fansub(uuid, integer, text, text) from public;
grant execute on function public.donate_to_fansub(uuid, integer, text, text) to authenticated;

commit;
