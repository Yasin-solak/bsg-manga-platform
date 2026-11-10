-- Discord model: single plan type + quantity picker
-- mega and top are deactivated, monthly stays as the standard boost
-- a p_quantity parameter is added to the purchase_fansub_boost RPC

begin;

-- -----------------------------------------------------------------------
-- 1. Plan konsolidasyonu
-- -----------------------------------------------------------------------

update public.fansub_boost_plans
set is_active = false, updated_at = now()
where code in ('mega', 'top')
  and is_active = true;

update public.fansub_boost_plans
set
  name = 'Takviye',
  metadata = jsonb_build_object(
    'accent', 'violet',
    'ctaLabel', 'Takviye et'
  ),
  updated_at = now()
where code = 'monthly';

-- -----------------------------------------------------------------------
-- 2. purchase_fansub_boost — p_quantity destegi
-- -----------------------------------------------------------------------

drop function if exists public.purchase_fansub_boost(uuid, text, text);

create or replace function public.purchase_fansub_boost(
  p_fansub_id uuid,
  p_plan_code text,
  p_supporter_note text default null,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_public_user_id();
  v_user public.users%rowtype;
  v_fansub public.fansubs%rowtype;
  v_plan public.fansub_boost_plans%rowtype;
  v_grant public.fansub_boost_grants%rowtype;
  v_supporter_state public.fansub_boost_supporter_states%rowtype;
  v_snapshot public.fansub_boost_snapshots%rowtype;
  v_supporter_note text := nullif(regexp_replace(trim(coalesce(p_supporter_note, '')), '\s+', ' ', 'g'), '');
  v_event_key text;
  v_member record;
  v_supporter_preview jsonb := '[]'::jsonb;
  v_duplicate_window interval := interval '12 seconds';
  v_new_user_stones integer := 0;
  v_quantity integer := coalesce(p_quantity, 1);
  v_total_coin_cost integer;
  v_total_boost_power integer;
begin
  if v_user_id is null then
    raise exception 'Bu islem icin giris yapmalisiniz.';
  end if;

  if not public.is_feature_enabled('boost.system', false) then
    raise exception 'Fansub takviye sistemi su anda aktif degil.';
  end if;

  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  if v_quantity < 1 or v_quantity > 10 then
    raise exception 'Takviye adedi 1 ile 10 arasinda olmalidir.';
  end if;

  select *
  into v_user
  from public.users
  where id = v_user_id
  for update;

  if not found or coalesce(v_user.is_active, true) = false then
    raise exception 'Aktif kullanici bulunamadi.';
  end if;

  if coalesce(v_user.is_banned, false) = true then
    raise exception 'Bu islem icin hesabin aktif olmasi gerekir.';
  end if;

  select *
  into v_fansub
  from public.fansubs
  where id = p_fansub_id
    and coalesce(is_active, true) = true
  limit 1;

  if not found then
    raise exception 'Fansub bulunamadi.';
  end if;

  select *
  into v_plan
  from public.fansub_boost_plans
  where code = lower(trim(coalesce(p_plan_code, '')))
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Takviye plani bulunamadi.';
  end if;

  if v_supporter_note is not null and char_length(v_supporter_note) > 220 then
    raise exception 'Destek notu en fazla 220 karakter olabilir.';
  end if;

  if v_supporter_note is not null and v_supporter_note ~* '(https?://|www\.)' then
    raise exception 'Destek notunda link paylasamazsiniz.';
  end if;

  if exists (
    select 1
    from public.fansub_boost_grants g
    where g.fansub_id = p_fansub_id
      and g.supporter_user_id = v_user_id
      and g.plan_code = v_plan.code
      and coalesce(g.supporter_note, '') = coalesce(v_supporter_note, '')
      and g.created_at >= now() - v_duplicate_window
  ) then
    raise exception 'Ayni takviye istegi yeni tamamlandi. Lutfen birkac saniye bekleyin.';
  end if;

  v_total_coin_cost := v_plan.coin_cost * v_quantity;
  v_total_boost_power := v_plan.boost_power * v_quantity;

  if coalesce(v_user.stones, 0) < v_total_coin_cost then
    raise exception 'Yeterli coin bulunamadi.';
  end if;

  update public.users
  set stones = stones - v_total_coin_cost
  where id = v_user_id
  returning stones into v_new_user_stones;

  insert into public.fansub_boost_grants (
    fansub_id,
    supporter_user_id,
    plan_id,
    plan_code,
    coin_cost,
    boost_power,
    duration_days,
    supporter_reward_tier,
    supporter_note,
    is_self_boost,
    starts_at,
    expires_at,
    metadata
  )
  values (
    p_fansub_id,
    v_user_id,
    v_plan.id,
    v_plan.code,
    v_total_coin_cost,
    v_total_boost_power,
    v_plan.duration_days,
    v_plan.supporter_reward_tier,
    v_supporter_note,
    exists (
      select 1
      from public.fansub_members fm
      where fm.fansub_id = p_fansub_id
        and fm.user_id = v_user_id
    ),
    now(),
    now() + make_interval(days => v_plan.duration_days),
    jsonb_build_object(
      'planName', v_plan.name,
      'supporterUsername', v_user.username,
      'quantity', v_quantity
    )
  )
  returning *
  into v_grant;

  v_supporter_state := public.refresh_fansub_boost_supporter_state(p_fansub_id, v_user_id);
  v_snapshot := public.refresh_fansub_boost_snapshot(p_fansub_id);
  v_event_key := format('fansub-boost:%s:%s', v_grant.id::text, p_fansub_id::text);
  v_supporter_preview := coalesce((
    select jsonb_agg(row_to_json(preview_row))
    from public.list_public_fansub_boost_supporters_preview(p_fansub_id, 6) preview_row
  ), '[]'::jsonb);

  for v_member in
    select fm.user_id
    from public.fansub_members fm
    where fm.fansub_id = p_fansub_id
      and fm.role = 'admin'
      and fm.user_id <> v_user_id
  loop
    perform public.push_notification(
      v_member.user_id,
      'system',
      'Fansub takviyesi alindi',
      format(
        '%s, %s adet takviye etkinlestirdi.',
        coalesce(v_user.username, 'Bir destekci'),
        v_quantity
      ),
      jsonb_build_object(
        'event', 'fansub_boost_purchased',
        'fansub_id', p_fansub_id,
        'grant_id', v_grant.id,
        'plan_code', v_plan.code,
        'plan_name', v_plan.name,
        'quantity', v_quantity,
        'supporter_user_id', v_user_id,
        'supporter_username', v_user.username,
        'event_key', format('%s:%s', v_event_key, v_member.user_id::text)
      ),
      'bolt'
    );
  end loop;

  return jsonb_build_object(
    'grantId', v_grant.id,
    'fansubId', p_fansub_id,
    'planCode', v_plan.code,
    'planName', v_plan.name,
    'coinCost', v_total_coin_cost,
    'boostPower', v_total_boost_power,
    'quantity', v_quantity,
    'durationDays', v_plan.duration_days,
    'supporterRewardTier', v_plan.supporter_reward_tier,
    'startsAt', v_grant.starts_at,
    'expiresAt', v_grant.expires_at,
    'newUserStones', greatest(v_new_user_stones, 0),
    'supporterPreview', v_supporter_preview,
    'supporterState', row_to_json(v_supporter_state),
    'snapshot', row_to_json(v_snapshot)
  );
end;
$$;

grant execute on function public.purchase_fansub_boost(uuid, text, text, integer) to authenticated;

commit;
