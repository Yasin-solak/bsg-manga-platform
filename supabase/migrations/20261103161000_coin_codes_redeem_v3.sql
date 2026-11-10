-- Coin code security fix (2/2): redeem function.
--
-- BUG: failed attempts were never recorded. The old version caught the error,
-- wrote to redeem_code_attempts, then rethrew; rethrowing rolled back
-- the whole transaction so the record (and the "failed attempt burst"
-- security event) never persisted (live: 0 of 23 attempts failed).
-- Result: code guessing / attempt count was never tracked or limited.
--
-- New behavior:
-- * User validation errors return {success:false, error}, not an exception
-- ; the attempt record persists. (The client treats success=false as an error;
-- the client ships first, this function applies after.)
-- * Rate limit: 10 failed attempts in the last 10 minutes -> 10 minute wait.
-- * No code can load to an inactive / missing fansub vault.
-- * A missing and an inactive code get the same message (code existence does not leak).
-- * A concurrent double click (unique violation) still returns "already used".
-- Permission, sign-in and feature flag errors stay exceptions.

create or replace function app_private.redeem_coin_code(p_code text, p_target_type text default 'user', p_fansub_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_target text;
  v_code public.redeem_codes%rowtype;
  v_code_key text := left(upper(btrim(coalesce(p_code, ''))), 64);
  v_error text := null;
  v_balance integer;
  v_watch boolean := false;
  v_count integer;
begin
  if to_regclass('public.security_events') is not null then
    v_watch := public.is_feature_enabled('security.redeem_anomaly_watch', false);
  end if;

  if not public.is_feature_enabled('economy.coin_codes', true) then
    raise exception 'Coin kodu aktivasyonu şu anda geçici olarak kapalı.';
  end if;

  v_user := public.current_public_user_id();
  if v_user is null then
    raise exception 'Bu işlem için giriş yapmalısın.';
  end if;

  v_target := lower(coalesce(btrim(p_target_type), 'user'));
  if v_target not in ('user', 'fansub') then
    raise exception 'Geçersiz hedef.';
  end if;

  if v_code_key = '' then
    return jsonb_build_object('success', false, 'error', 'Kod boş olamaz.', 'error_code', 'empty');
  end if;

  -- Hiz siniri (kalici basarisiz deneme kayitlarina dayanir).
  select count(*) into v_count
  from public.redeem_code_attempts a
  where a.user_id = v_user
    and a.is_success = false
    and a.created_at >= now() - interval '10 minutes';
  if v_count >= 10 then
    return jsonb_build_object('success', false, 'error', 'Çok fazla hatalı deneme yaptın. 10 dakika sonra tekrar dene.', 'error_code', 'rate_limited');
  end if;

  select * into v_code
  from public.redeem_codes
  where upper(code) = v_code_key
  for update;

  if not found or v_code.is_active is distinct from true then
    v_error := 'Geçersiz kod. Yazımı kontrol et.';
  elsif v_code.expires_at <= now() then
    v_error := 'Bu kodun süresi dolmuş.';
  elsif v_code.used_count >= v_code.max_uses then
    v_error := 'Bu kod kullanım limitine ulaşmış.';
  elsif v_target = 'user' and v_code.target_type not in ('user', 'both') then
    v_error := 'Bu kod kişisel bakiye için kullanılamaz.';
  elsif v_target = 'user' and exists (select 1 from public.user_code_redemptions r where r.user_id = v_user and r.code_id = v_code.id) then
    v_error := 'Bu kodu zaten kullandın.';
  elsif v_target = 'fansub' and p_fansub_id is null then
    v_error := 'Fansub seçimi zorunlu.';
  elsif v_target = 'fansub' and v_code.target_type not in ('fansub', 'both') then
    v_error := 'Bu kod fansub kasası için kullanılamaz.';
  elsif v_target = 'fansub' and not (public.is_admin() or public.is_fansub_admin(p_fansub_id)) then
    v_error := 'Bu fansub için yetkin yok.';
  elsif v_target = 'fansub' and not exists (select 1 from public.fansubs f where f.id = p_fansub_id and coalesce(f.is_active, true)) then
    v_error := 'Fansub bulunamadı ya da pasif.';
  elsif v_target = 'fansub' and exists (select 1 from public.fansub_code_redemptions r where r.fansub_id = p_fansub_id and r.code_id = v_code.id) then
    v_error := 'Bu kod bu fansub için zaten kullanıldı.';
  end if;

  if v_error is null then
    begin
      if v_target = 'user' then
        insert into public.user_code_redemptions (user_id, code_id, redeemed_at)
        values (v_user, v_code.id, now());
        update public.users set stones = stones + v_code.value where id = v_user
        returning stones into v_balance;
      else
        insert into public.fansub_code_redemptions (fansub_id, code_id, redeemed_by, redeemed_at)
        values (p_fansub_id, v_code.id, v_user, now());
        update public.fansubs set coin_balance = coin_balance + v_code.value where id = p_fansub_id
        returning coin_balance into v_balance;
        insert into public.fansub_transactions (fansub_id, amount, type, description, created_by)
        values (p_fansub_id, v_code.value, 'redeem', format('Kod kullanımı: %s', v_code.code), v_user);
      end if;
      update public.redeem_codes set used_count = used_count + 1 where id = v_code.id;
    exception when unique_violation then
      v_error := case when v_target = 'user' then 'Bu kodu zaten kullandın.' else 'Bu kod bu fansub için zaten kullanıldı.' end;
    end;
  end if;

  insert into public.redeem_code_attempts (user_id, code_id, code_key, target_type, fansub_id, is_success, error_message)
  values (v_user, v_code.id, v_code_key, v_target, case when v_target = 'fansub' then p_fansub_id end, v_error is null, v_error);

  if v_watch then
    select count(*) into v_count
    from public.redeem_code_attempts a
    where a.user_id = v_user
      and a.is_success = (v_error is null)
      and a.created_at >= now() - interval '10 minutes';

    if v_error is not null and v_count >= 5 and not exists (
      select 1 from public.security_events se
      where se.target_user_id = v_user and se.event_type = 'redeem_failure_burst' and se.created_at >= now() - interval '10 minutes'
    ) then
      insert into public.security_events (source, event_type, severity, message, metadata, actor_user_id, target_user_id)
      values ('redeem', 'redeem_failure_burst', 'high', format('Kisa surede coklu hatali kod denemesi (%s/10dk).', v_count),
        jsonb_build_object('count10m', v_count, 'codeKey', v_code_key, 'targetType', v_target), v_user, v_user);
    elsif v_error is null and v_count >= 6 and not exists (
      select 1 from public.security_events se
      where se.target_user_id = v_user
        and se.event_type = case when v_count >= 10 then 'redeem_velocity_critical' else 'redeem_velocity_high' end
        and se.created_at >= now() - interval '10 minutes'
    ) then
      insert into public.security_events (source, event_type, severity, message, metadata, actor_user_id, target_user_id)
      values ('redeem',
        case when v_count >= 10 then 'redeem_velocity_critical' else 'redeem_velocity_high' end,
        case when v_count >= 10 then 'critical' else 'high' end,
        format('Kisa surede coklu kod aktivasyonu (%s/10dk).', v_count),
        jsonb_build_object('count10m', v_count, 'targetType', v_target, 'codeKey', v_code_key, 'fansubId', p_fansub_id), v_user, v_user);
    end if;
  end if;

  if v_error is not null then
    return jsonb_build_object('success', false, 'error', v_error, 'error_code', 'rejected');
  end if;

  return jsonb_build_object(
    'success', true,
    'target_type', v_target,
    'code_id', v_code.id,
    'code', v_code.code,
    'credited_value', v_code.value,
    'new_balance', coalesce(v_balance, 0),
    'fansub_id', case when v_target = 'fansub' then p_fansub_id end,
    'redeemed_at', now()
  );
end;
$function$;
