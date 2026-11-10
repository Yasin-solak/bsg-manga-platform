-- ============================================
-- BSG Manga | Security Ops Faz-2
-- Date: 2026-02-15
-- ============================================

begin;

-- --------------------------------------------
-- Temporary ban aware auth helpers
-- --------------------------------------------
create or replace function public.current_public_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
    and coalesce(u.is_active, true) = true
    and not (
      coalesce(u.is_banned, false) = true
      and (u.ban_until is null or u.ban_until > now())
    )
  limit 1;
$$;

create or replace function public.current_app_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_is_active boolean;
  v_is_banned boolean;
  v_ban_until timestamptz;
begin
  if auth.uid() is null then
    return 'anon';
  end if;

  select
    u.role,
    coalesce(u.is_active, true),
    coalesce(u.is_banned, false),
    u.ban_until
  into
    v_role,
    v_is_active,
    v_is_banned,
    v_ban_until
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if v_is_active is distinct from true then
    return 'anon';
  end if;

  if v_is_banned = true and (v_ban_until is null or v_ban_until > now()) then
    return 'anon';
  end if;

  return coalesce(v_role, 'user');
end;
$$;

-- --------------------------------------------
-- Redeem attempts telemetry table
-- --------------------------------------------
create table if not exists public.redeem_code_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  code_id uuid references public.redeem_codes(id) on delete set null,
  code_key text not null default '',
  target_type text not null default 'unknown'
    check (target_type in ('user', 'fansub', 'unknown')),
  fansub_id uuid references public.fansubs(id) on delete set null,
  is_success boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists redeem_code_attempts_created_at_idx on public.redeem_code_attempts (created_at desc);
create index if not exists redeem_code_attempts_user_created_at_idx on public.redeem_code_attempts (user_id, created_at desc);
create index if not exists redeem_code_attempts_success_idx on public.redeem_code_attempts (is_success, created_at desc);
create index if not exists redeem_code_attempts_code_key_idx on public.redeem_code_attempts (code_key);

alter table public.redeem_code_attempts enable row level security;

drop policy if exists redeem_code_attempts_select_admin on public.redeem_code_attempts;
create policy redeem_code_attempts_select_admin
  on public.redeem_code_attempts
  for select
  using (public.is_admin());

drop policy if exists redeem_code_attempts_insert_authenticated on public.redeem_code_attempts;
create policy redeem_code_attempts_insert_authenticated
  on public.redeem_code_attempts
  for insert
  with check (auth.uid() is not null);

grant select, insert on public.redeem_code_attempts to authenticated;

-- --------------------------------------------
-- Redeem RPC: anti-abuse telemetry + auto security events
-- --------------------------------------------
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
  v_target text := 'unknown';
  v_code public.redeem_codes%rowtype;
  v_new_balance integer;
  v_fansub public.fansubs%rowtype;
  v_code_key text := left(upper(trim(coalesce(p_code, ''))), 64);
  v_error_message text := null;
  v_watch_enabled boolean := false;
  v_success_10m_count int := 0;
  v_fail_10m_count int := 0;
begin
  if to_regclass('public.security_events') is not null then
    v_watch_enabled := public.is_feature_enabled('security.redeem_anomaly_watch', false);
  end if;

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

    insert into public.redeem_code_attempts (
      user_id,
      code_id,
      code_key,
      target_type,
      fansub_id,
      is_success
    )
    values (
      v_public_user_id,
      v_code.id,
      v_code_key,
      'user',
      null,
      true
    );

    if v_watch_enabled then
      select count(*)
      into v_success_10m_count
      from public.redeem_code_attempts a
      where a.user_id = v_public_user_id
        and a.is_success = true
        and a.created_at >= now() - interval '10 minutes';

      if v_success_10m_count >= 10 then
        if not exists (
          select 1
          from public.security_events se
          where se.target_user_id = v_public_user_id
            and se.event_type = 'redeem_velocity_critical'
            and se.created_at >= now() - interval '10 minutes'
        ) then
          insert into public.security_events (
            source,
            event_type,
            severity,
            message,
            metadata,
            actor_user_id,
            target_user_id
          )
          values (
            'redeem',
            'redeem_velocity_critical',
            'critical',
            format('Kisa surede coklu kod aktivasyonu tespit edildi (%s/10dk).', v_success_10m_count),
            jsonb_build_object('count10m', v_success_10m_count, 'targetType', v_target, 'codeKey', v_code_key),
            v_public_user_id,
            v_public_user_id
          );
        end if;
      elsif v_success_10m_count >= 6 then
        if not exists (
          select 1
          from public.security_events se
          where se.target_user_id = v_public_user_id
            and se.event_type = 'redeem_velocity_high'
            and se.created_at >= now() - interval '10 minutes'
        ) then
          insert into public.security_events (
            source,
            event_type,
            severity,
            message,
            metadata,
            actor_user_id,
            target_user_id
          )
          values (
            'redeem',
            'redeem_velocity_high',
            'high',
            format('Redeem hizinda anomali tespit edildi (%s/10dk).', v_success_10m_count),
            jsonb_build_object('count10m', v_success_10m_count, 'targetType', v_target, 'codeKey', v_code_key),
            v_public_user_id,
            v_public_user_id
          );
        end if;
      end if;
    end if;

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

  insert into public.redeem_code_attempts (
    user_id,
    code_id,
    code_key,
    target_type,
    fansub_id,
    is_success
  )
  values (
    v_public_user_id,
    v_code.id,
    v_code_key,
    'fansub',
    p_fansub_id,
    true
  );

  if v_watch_enabled then
    select count(*)
    into v_success_10m_count
    from public.redeem_code_attempts a
    where a.user_id = v_public_user_id
      and a.is_success = true
      and a.created_at >= now() - interval '10 minutes';

    if v_success_10m_count >= 10 then
      if not exists (
        select 1
        from public.security_events se
        where se.target_user_id = v_public_user_id
          and se.event_type = 'redeem_velocity_critical'
          and se.created_at >= now() - interval '10 minutes'
      ) then
        insert into public.security_events (
          source,
          event_type,
          severity,
          message,
          metadata,
          actor_user_id,
          target_user_id
        )
        values (
          'redeem',
          'redeem_velocity_critical',
          'critical',
          format('Kisa surede coklu kod aktivasyonu tespit edildi (%s/10dk).', v_success_10m_count),
          jsonb_build_object('count10m', v_success_10m_count, 'targetType', v_target, 'codeKey', v_code_key, 'fansubId', p_fansub_id),
          v_public_user_id,
          v_public_user_id
        );
      end if;
    elsif v_success_10m_count >= 6 then
      if not exists (
        select 1
        from public.security_events se
        where se.target_user_id = v_public_user_id
          and se.event_type = 'redeem_velocity_high'
          and se.created_at >= now() - interval '10 minutes'
      ) then
        insert into public.security_events (
          source,
          event_type,
          severity,
          message,
          metadata,
          actor_user_id,
          target_user_id
        )
        values (
          'redeem',
          'redeem_velocity_high',
          'high',
          format('Redeem hizinda anomali tespit edildi (%s/10dk).', v_success_10m_count),
          jsonb_build_object('count10m', v_success_10m_count, 'targetType', v_target, 'codeKey', v_code_key, 'fansubId', p_fansub_id),
          v_public_user_id,
          v_public_user_id
        );
      end if;
    end if;
  end if;

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
      v_error_message := 'Bu kodu zaten kullandiniz.';
    else
      v_error_message := 'Bu kod bu fansub tarafindan zaten kullanildi.';
    end if;

    insert into public.redeem_code_attempts (
      user_id,
      code_id,
      code_key,
      target_type,
      fansub_id,
      is_success,
      error_message
    )
    values (
      v_public_user_id,
      coalesce(v_code.id, null),
      v_code_key,
      coalesce(v_target, 'unknown'),
      p_fansub_id,
      false,
      v_error_message
    );

    if v_watch_enabled and v_public_user_id is not null then
      select count(*)
      into v_fail_10m_count
      from public.redeem_code_attempts a
      where a.user_id = v_public_user_id
        and a.is_success = false
        and a.created_at >= now() - interval '10 minutes';

      if v_fail_10m_count >= 5 then
        if not exists (
          select 1
          from public.security_events se
          where se.target_user_id = v_public_user_id
            and se.event_type = 'redeem_failure_burst'
            and se.created_at >= now() - interval '10 minutes'
        ) then
          insert into public.security_events (
            source,
            event_type,
            severity,
            message,
            metadata,
            actor_user_id,
            target_user_id
          )
          values (
            'redeem',
            'redeem_failure_burst',
            'high',
            format('Kisa surede coklu redeem hata denemesi (%s/10dk).', v_fail_10m_count),
            jsonb_build_object('count10m', v_fail_10m_count, 'codeKey', v_code_key, 'targetType', v_target),
            v_public_user_id,
            v_public_user_id
          );
        end if;
      end if;
    end if;

    raise exception '%', v_error_message;
  when others then
    insert into public.redeem_code_attempts (
      user_id,
      code_id,
      code_key,
      target_type,
      fansub_id,
      is_success,
      error_message
    )
    values (
      v_public_user_id,
      coalesce(v_code.id, null),
      v_code_key,
      coalesce(v_target, 'unknown'),
      p_fansub_id,
      false,
      left(coalesce(SQLERRM, 'Redeem error'), 500)
    );

    if v_watch_enabled and v_public_user_id is not null then
      select count(*)
      into v_fail_10m_count
      from public.redeem_code_attempts a
      where a.user_id = v_public_user_id
        and a.is_success = false
        and a.created_at >= now() - interval '10 minutes';

      if v_fail_10m_count >= 5 then
        if not exists (
          select 1
          from public.security_events se
          where se.target_user_id = v_public_user_id
            and se.event_type = 'redeem_failure_burst'
            and se.created_at >= now() - interval '10 minutes'
        ) then
          insert into public.security_events (
            source,
            event_type,
            severity,
            message,
            metadata,
            actor_user_id,
            target_user_id
          )
          values (
            'redeem',
            'redeem_failure_burst',
            'high',
            format('Kisa surede coklu redeem hata denemesi (%s/10dk).', v_fail_10m_count),
            jsonb_build_object('count10m', v_fail_10m_count, 'codeKey', v_code_key, 'targetType', v_target),
            v_public_user_id,
            v_public_user_id
          );
        end if;
      end if;
    end if;

    raise;
end;
$$;

grant execute on function public.redeem_coin_code(text, text, uuid) to authenticated;

commit;
