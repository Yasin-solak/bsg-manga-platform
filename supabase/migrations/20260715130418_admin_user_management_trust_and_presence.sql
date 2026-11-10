-- Explainable trust score and real last activity foundation for admin user management.
-- Trust V1 uses only verified account, account age and finalized admin bans.

begin;

create schema if not exists app_private;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.get_admin_user_trust_v1(
  p_as_of timestamptz,
  p_user_id uuid default null
)
returns table (
  user_id uuid,
  score smallint,
  band text,
  confidence text,
  reason_codes text[],
  components jsonb,
  algorithm_version text,
  calculated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_as_of is null then
    raise exception using
      errcode = '22023',
      message = 'Guven skoru referans zamani bos olamaz.';
  end if;

  return query
  with ban_history as materialized (
    select
      se.target_user_id as user_id,
      pg_catalog.count(*)::integer as ban_count,
      least(
        60,
        coalesce(pg_catalog.sum(
          case
            when se.created_at >= p_as_of - interval '30 days' then 20
            when se.created_at >= p_as_of - interval '90 days' then 12
            when se.created_at >= p_as_of - interval '180 days' then 8
            else 4
          end
        ), 0)::integer
      ) as ban_penalty
    from public.security_events as se
    where se.target_user_id is not null
      and se.event_type = 'user_banned'
      and se.created_at >= p_as_of - interval '365 days'
      and se.created_at <= p_as_of
      and (p_user_id is null or se.target_user_id = p_user_id)
    group by se.target_user_id
  ),
  base as materialized (
    select
      u.id as user_id,
      (
        coalesce(u.is_banned, false)
        and (u.ban_until is null or u.ban_until > p_as_of)
      ) as is_banned,
      (au.email_confirmed_at is not null) as is_verified,
      greatest(
        0,
        pg_catalog.floor(
          extract(epoch from (p_as_of - u.created_at)) / 86400
        )::integer
      ) as account_age_days,
      coalesce(bh.ban_count, 0) as ban_count,
      coalesce(bh.ban_penalty, 0) as ban_penalty
    from public.users as u
    left join auth.users as au on au.id = u.auth_user_id
    left join ban_history as bh on bh.user_id = u.id
    where p_user_id is null or u.id = p_user_id
  ),
  weighted as materialized (
    select
      b.*,
      case when b.is_verified then 10 else 0 end as verification_points,
      case
        when b.account_age_days >= 180 then 15
        when b.account_age_days >= 90 then 12
        when b.account_age_days >= 30 then 8
        when b.account_age_days >= 7 then 4
        else 0
      end as tenure_points,
      case
        when b.ban_count > 0 then 0
        when b.account_age_days >= 90 then 15
        when b.account_age_days >= 30 then 10
        when b.account_age_days >= 14 then 5
        else 0
      end as clean_observation_points,
      case
        when b.account_age_days < 14 then 'low'
        when b.account_age_days < 90 then 'medium'
        else 'high'
      end as confidence_value
    from base as b
  ),
  scored as materialized (
    select
      w.*,
      case
        when w.is_banned then 0
        else greatest(
          0,
          least(
            100,
            60
              + w.verification_points
              + w.tenure_points
              + w.clean_observation_points
              - w.ban_penalty
          )
        )
      end::smallint as score_value
    from weighted as w
  )
  select
    s.user_id,
    s.score_value,
    case
      when s.score_value >= 80 then 'trusted'
      when s.score_value >= 60 then 'standard'
      when s.score_value >= 40 then 'review'
      else 'low'
    end as band,
    s.confidence_value as confidence,
    pg_catalog.array_remove(array[
      case when s.is_verified then 'EMAIL_VERIFIED' else 'EMAIL_UNVERIFIED' end,
      case
        when s.account_age_days >= 180 then 'TENURE_180D'
        when s.account_age_days >= 90 then 'TENURE_90D'
        when s.account_age_days >= 30 then 'TENURE_30D'
        when s.account_age_days >= 7 then 'TENURE_7D'
        else 'TENURE_NEW'
      end,
      case when s.clean_observation_points > 0 then 'CLEAN_OBSERVATION' end,
      case when s.ban_count > 0 then 'CONFIRMED_BAN_HISTORY' end,
      case when s.is_banned then 'ACTIVE_BAN' end,
      case when s.confidence_value = 'low' then 'INSUFFICIENT_HISTORY' end
    ]::text[], null) as reason_codes,
    pg_catalog.jsonb_build_object(
      'baseline', 60,
      'emailVerification', s.verification_points,
      'accountTenure', s.tenure_points,
      'cleanObservation', s.clean_observation_points,
      'confirmedBanPenalty', -s.ban_penalty,
      'activeBanOverride', s.is_banned,
      'accountAgeDays', s.account_age_days,
      'confirmedBanCount', s.ban_count
    ) as components,
    'trust-v1.0'::text as algorithm_version,
    p_as_of as calculated_at
  from scored as s;
end;
$function$;

revoke all on function app_private.get_admin_user_trust_v1(timestamptz, uuid)
  from public, anon, authenticated;

comment on function app_private.get_admin_user_trust_v1(timestamptz, uuid) is
  'Admin read modelleri icin zaman-duyarli, aciklanabilir ve request-time Guven V1 projectioni.';

create or replace function app_private.touch_my_presence()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_session_id uuid := public.current_auth_session_id();
  v_as_of timestamptz := pg_catalog.statement_timestamp();
  v_last_seen_at timestamptz;
  v_revoked_at timestamptz;
  v_inserted_count integer := 0;
  v_updated boolean := false;
begin
  if v_auth_user_id is null or v_session_id is null then
    raise exception using errcode = '42501', message = 'Gecerli bir oturum gerekir.';
  end if;

  if not exists (
    select 1
    from public.users as u
    where u.auth_user_id = v_auth_user_id
      and u.active_session_id = v_session_id
      and coalesce(u.is_active, true) = true
      and not (
        coalesce(u.is_banned, false)
        and (u.ban_until is null or u.ban_until > v_as_of)
      )
  ) then
    raise exception using errcode = '42501', message = 'Presence yalniz aktif oturum icin kaydedilebilir.';
  end if;

  insert into public.auth_session_events (
    auth_user_id,
    session_id,
    claimed_at,
    last_seen_at
  )
  values (
    v_auth_user_id,
    v_session_id,
    v_as_of,
    v_as_of
  )
  on conflict (auth_user_id, session_id) do nothing;

  get diagnostics v_inserted_count = row_count;
  v_updated := v_inserted_count > 0;

  select e.last_seen_at, e.revoked_at
  into v_last_seen_at, v_revoked_at
  from public.auth_session_events as e
  where e.auth_user_id = v_auth_user_id
    and e.session_id = v_session_id
  for update;

  if not found or v_revoked_at is not null then
    raise exception using errcode = '42501', message = 'Kapatilmis oturum presence guncelleyemez.';
  end if;

  if not v_updated and v_last_seen_at < v_as_of - interval '45 seconds' then
    update public.auth_session_events as e
    set last_seen_at = v_as_of
    where e.auth_user_id = v_auth_user_id
      and e.session_id = v_session_id
      and e.revoked_at is null
    returning e.last_seen_at into v_last_seen_at;
    v_updated := found;
  end if;

  if v_inserted_count > 0 then
    delete from public.auth_session_events as e
    where e.auth_user_id = v_auth_user_id
      and e.id in (
        select stale.id
        from public.auth_session_events as stale
        where stale.auth_user_id = v_auth_user_id
        order by stale.claimed_at desc, stale.id desc
        offset 20
      );
  end if;

  return pg_catalog.jsonb_build_object(
    'lastSeenAt', v_last_seen_at,
    'updated', v_updated
  );
end;
$function$;

create or replace function public.touch_my_presence()
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select app_private.touch_my_presence();
$function$;

revoke all on function app_private.touch_my_presence()
  from public, anon, authenticated;
grant execute on function app_private.touch_my_presence()
  to authenticated;
revoke all on function public.touch_my_presence()
  from public, anon, authenticated;
grant execute on function public.touch_my_presence()
  to authenticated;

-- The optional device metadata contract on live is kept during CREATE OR REPLACE.
create or replace function app_private.record_auth_session_context(
  p_session_id uuid,
  p_device_id text default null,
  p_device_label text default null,
  p_platform text default null,
  p_browser text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_claim_session_id uuid := public.current_auth_session_id();
  v_as_of timestamptz := pg_catalog.statement_timestamp();
  v_saved_session_id uuid;
begin
  if v_auth_user_id is null or v_claim_session_id is null then
    raise exception using errcode = '42501', message = 'Gecerli bir oturum gerekir.';
  end if;

  if p_session_id is null or p_session_id is distinct from v_claim_session_id then
    raise exception using errcode = '42501', message = 'Session kimligi JWT oturumuyla eslesmiyor.';
  end if;

  if not exists (
    select 1
    from public.users as u
    where u.auth_user_id = v_auth_user_id
      and u.active_session_id = v_claim_session_id
      and coalesce(u.is_active, true) = true
      and not (
        coalesce(u.is_banned, false)
        and (u.ban_until is null or u.ban_until > v_as_of)
      )
  ) then
    raise exception using errcode = '42501', message = 'Yalniz aktif session baglami kaydedilebilir.';
  end if;

  insert into public.auth_session_events (
    auth_user_id,
    session_id,
    claimed_at,
    last_seen_at,
    device_id,
    device_label,
    platform,
    browser,
    user_agent
  )
  values (
    v_auth_user_id,
    v_claim_session_id,
    v_as_of,
    v_as_of,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_device_id, '')), 200), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_device_label, '')), 200), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_platform, '')), 100), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_browser, '')), 100), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_user_agent, '')), 1000), '')
  )
  on conflict (auth_user_id, session_id)
  do update
    set last_seen_at = excluded.last_seen_at,
        device_id = coalesce(excluded.device_id, public.auth_session_events.device_id),
        device_label = coalesce(excluded.device_label, public.auth_session_events.device_label),
        platform = coalesce(excluded.platform, public.auth_session_events.platform),
        browser = coalesce(excluded.browser, public.auth_session_events.browser),
        user_agent = coalesce(excluded.user_agent, public.auth_session_events.user_agent)
    where public.auth_session_events.revoked_at is null
  returning session_id into v_saved_session_id;

  if v_saved_session_id is null then
    raise exception using errcode = '42501', message = 'Kapatilmis oturum baglami guncellenemez.';
  end if;
end;
$function$;

create or replace function public.record_auth_session_context(
  p_session_id uuid,
  p_device_id text default null,
  p_device_label text default null,
  p_platform text default null,
  p_browser text default null,
  p_user_agent text default null
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select app_private.record_auth_session_context(
    p_session_id,
    p_device_id,
    p_device_label,
    p_platform,
    p_browser,
    p_user_agent
  );
$function$;

revoke all on function app_private.record_auth_session_context(
  uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function app_private.record_auth_session_context(
  uuid, text, text, text, text, text
) to authenticated;
revoke all on function public.record_auth_session_context(
  uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_auth_session_context(
  uuid, text, text, text, text, text
) to authenticated;

comment on function public.touch_my_presence() is
  'JWT session kimligine bagli, 45 saniye DB yazma throttle uygulayan son aktivite heartbeat RPCsi.';

notify pgrst, 'reload schema';
commit;
