begin;

create table if not exists public.fansub_boost_capability_policies (
  capability_key text primary key,
  label text not null,
  summary text not null default '',
  detail text not null default '',
  placement_hint text not null default '',
  surface_group text not null default 'general',
  placement_type text not null check (placement_type in ('core', 'tier', 'disabled')),
  tier_level integer null check (tier_level between 1 and 3),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fansub_boost_capability_policies_tier_guard check (
    (placement_type = 'tier' and tier_level is not null)
    or (placement_type <> 'tier' and tier_level is null)
  )
);

create index if not exists idx_fansub_boost_capability_policies_sort
  on public.fansub_boost_capability_policies (sort_order, capability_key);

insert into public.fansub_boost_capability_policies as policy (
  capability_key,
  label,
  summary,
  detail,
  placement_hint,
  surface_group,
  placement_type,
  tier_level,
  sort_order
)
values
  ('hasAnalytics', 'Temel analytics', 'Takip, bagis ve ritim ozetleri boost kilidi olmadan acik kalir.', 'Yonetim istatistikleri temel operasyon verisi olarak kullanilir.', 'Yonetim > Istatistikler', 'core', 'core', null, 10),
  ('canUsePolls', 'Mini anket', 'Topluluk postlari icinde basic anketler herkese acik kalir.', 'Anket artik boost ayricaligi degil, temel etkilesim aracidir.', 'Yonetim > Postlar', 'core', 'core', null, 20),
  ('canManagePinnedNotice', 'Public duyurular', 'Public duyuru akisi temel iletisim katmani olarak kullanilir.', 'Fansub kendi duyuru akisina boost beklemeden sahip olur.', 'Yonetim > Duyurular', 'communication', 'core', null, 30),
  ('canUseSupporterList', 'Bagis ve takviyede bulunanlar', 'Basic supporter ve donor ozeti public sosyal kanit katmanidir.', 'Supporter ozeti, detay ve kapanis yuzeylerinde gorunur.', 'Takviye sekmesi, detay, kapanis seridi', 'supporters', 'core', null, 40),
  ('hasChapterEndCredit', 'Kapanis seridi', 'Bolum sonunda tesekkur ve yonlendirme seridi temel urun parcasi olarak calisir.', 'Reader sonundaki kapanis alani boost olmasa da acik kalir.', 'Reader sonu', 'reader', 'core', null, 50),
  ('canShowcaseManga', 'Manga vitrini', 'Fansub kendi manga vitrini ve basic public kimligini boost beklemeden gosterir.', 'Manga vitrini artik temel profil sunumunun parcasi.', 'Fansub profil sayfasi', 'identity', 'core', null, 60),
  ('canUploadStaticBackground', 'Statik arka plan', 'Fansub vitrini ilk gorsel farki kazanir.', 'Statik arka plan ile profil kahramani daha ayirt edici olur.', 'Duzenle modal > Arka plan', 'background', 'tier', 1, 110),
  ('canUploadVideoBackground', 'Video arka plan', 'Vitrin daha hareketli ve premium his verir.', 'Video arka plan aktif oldugunda fansub kahramani daha sinematik gorunur.', 'Duzenle modal > Arka plan', 'background', 'tier', 1, 120),
  ('hasDiscoverBadge', 'Topluluk destekli rozeti', 'Destek alan ekip kimligi profil ve katalog yuzeylerinde one cikar.', 'Rozet isim sonunda, katalogda ve hover yuzeylerinde gorunur.', 'Profil, katalog, hover', 'identity', 'tier', 1, 130),
  ('hasFullNameStyle', 'Gelismis isim stili', 'Fansub adi daha guclu bir kimlik katmani kazanir.', 'Tam isim stili profil ve katalog yuzeylerine tasinir.', 'Profil, katalog, hover', 'identity', 'tier', 2, 210),
  ('canUseSpecialNotifications', 'Ozel bildirim', 'Takipcilerle tek amacli bildirim akisi kurulabilir.', 'Ozel bildirim sayesinde takipcilere daha dogrudan ulasilir.', 'Yonetim > Duyurular', 'communication', 'tier', 2, 220),
  ('hasSupporterStreak', 'Destek serisi', 'Tekrarli destek davranisi supporter kimligine donusur.', 'Supporter seri kimligi public reward yuzeylerine yansir.', 'Supporter kartlari ve reward yuzeyleri', 'supporters', 'tier', 2, 230),
  ('hasFoundingSupporter', 'Kurucu destekci', 'Ilk destek verenler kalici bir kimlik katmani kazanir.', 'Kurucu rozetleri supporter kimligi ve reward sunumuna eklenir.', 'Supporter kartlari ve reward yuzeyleri', 'supporters', 'tier', 2, 240),
  ('hasGoldFrame', 'Takviye cercevesi', 'Prestij katmaninda fansub vitrini daha ayirt edici hale gelir.', 'Takviye cercevesi avatar ve profil kahramaninda gorunur.', 'Profil kahramani', 'prestige', 'tier', 3, 310),
  ('hasVanityUrl', 'Vanity URL', 'Paylasilabilirlik ve kimlik icin ozel URL acilir.', 'Fansub kendi kisa ve daha hatirlanabilir rotasini kullanir.', 'Public fansub rotasi', 'prestige', 'tier', 3, 320),
  ('hasAdvancedAnalytics', 'Gelismis analytics', 'Prestij katmaninda daha derin icgoru ve olcum verisi acilir.', 'Ileri seviye analytics sadece ust katmanda aktif olur.', 'Yonetim > Istatistikler', 'prestige', 'tier', 3, 330)
on conflict (capability_key) do update
set
  label = excluded.label,
  summary = excluded.summary,
  detail = excluded.detail,
  placement_hint = excluded.placement_hint,
  surface_group = excluded.surface_group,
  placement_type = excluded.placement_type,
  tier_level = excluded.tier_level,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function public.describe_fansub_boost_policy_placement(
  p_placement_type text,
  p_tier_level integer
)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_placement_type, 'disabled')))
    when 'core' then 'Core'
    when 'tier' then format('Seviye %s', greatest(1, least(coalesce(p_tier_level, 1), 3)))
    else 'Kapali'
  end;
$$;

grant execute on function public.describe_fansub_boost_policy_placement(text, integer) to anon, authenticated;

create or replace function public.build_fansub_boost_capabilities(
  p_tier_level integer
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tier_level integer := greatest(coalesce(p_tier_level, 0), 0);
  v_tier_key text := case
    when v_tier_level >= 3 then 'prestige'
    when v_tier_level = 2 then 'community'
    when v_tier_level = 1 then 'visible-support'
    else 'core'
  end;
  v_tier_label text := case
    when v_tier_level >= 3 then 'Prestij'
    when v_tier_level = 2 then 'Topluluk etkisi'
    when v_tier_level = 1 then 'Gorunur destek'
    else 'Core'
  end;
  v_next_tier_level integer := public.get_fansub_boost_next_tier_level(v_tier_level);
  v_next_tier_label text := case
    when v_next_tier_level = 1 then 'Gorunur destek'
    when v_next_tier_level = 2 then 'Topluluk etkisi'
    when v_next_tier_level = 3 then 'Prestij'
    else null
  end;
  v_current_labels text[] := array[]::text[];
  v_next_labels text[] := array[]::text[];
  v_result jsonb := jsonb_build_object(
    'tierLevel', v_tier_level,
    'tierKey', v_tier_key,
    'tierLabel', v_tier_label,
    'tierHeadline', '',
    'tierSummary', '',
    'currentBenefits', '[]'::jsonb,
    'nextTierSummary', '',
    'nextTierBenefits', '[]'::jsonb,
    'nextTierCallout', '',
    'canUploadStaticBackground', false,
    'canUploadVideoBackground', false,
    'hasFullNameStyle', false,
    'canUsePolls', false,
    'hasAnalytics', false,
    'hasAdvancedAnalytics', false,
    'hasChapterEndCredit', false,
    'hasDiscoverBadge', false,
    'hasGoldFrame', false,
    'hasVanityUrl', false,
    'canManagePinnedNotice', false,
    'canUseSupporterList', false,
    'canUseSpecialNotifications', false,
    'canShowcaseManga', false,
    'hasSupporterStreak', false,
    'hasFoundingSupporter', false,
    'emojiSlotLimit', case
      when v_tier_level >= 3 then 8
      when v_tier_level = 2 then 5
      when v_tier_level = 1 then 3
      else 0
    end,
    'hasFansubProfileEffect', false,
    'hasShimmer', v_tier_level >= 3,
    'hasHomepagePlacement', false,
    'hasAutoCommunityPosts', false,
    'hasInviteCard', false,
    'hasHonorWall', false
  );
  v_policy record;
begin
  for v_policy in
    select
      policy.capability_key,
      policy.placement_type,
      policy.tier_level
    from public.fansub_boost_capability_policies as policy
    order by policy.sort_order asc, policy.capability_key asc
  loop
    if v_policy.placement_type = 'core' then
      v_result := jsonb_set(v_result, array[v_policy.capability_key], 'true'::jsonb, true);
    elsif v_policy.placement_type = 'tier' and v_tier_level >= coalesce(v_policy.tier_level, 99) then
      v_result := jsonb_set(v_result, array[v_policy.capability_key], 'true'::jsonb, true);
    else
      v_result := jsonb_set(v_result, array[v_policy.capability_key], 'false'::jsonb, true);
    end if;
  end loop;

  if v_tier_level = 0 then
    select coalesce(array_agg(policy.label order by policy.sort_order asc), array[]::text[])
    into v_current_labels
    from public.fansub_boost_capability_policies as policy
    where policy.placement_type = 'core';
  else
    select coalesce(array_agg(policy.label order by policy.sort_order asc), array[]::text[])
    into v_current_labels
    from public.fansub_boost_capability_policies as policy
    where policy.placement_type = 'tier'
      and policy.tier_level = v_tier_level;
  end if;

  if v_next_tier_level is not null then
    select coalesce(array_agg(policy.label order by policy.sort_order asc), array[]::text[])
    into v_next_labels
    from public.fansub_boost_capability_policies as policy
    where policy.placement_type = 'tier'
      and policy.tier_level = v_next_tier_level;
  end if;

  v_result := v_result || jsonb_build_object(
    'tierHeadline',
      case
        when v_tier_level = 0 then 'Fansub temel katmanda. Boost, core araclarin ustune gorunur katmanlar ekler.'
        else format('Fansub %s katmaninda. Bu seviyedeki yerlesim policy ile canli olarak yonetilir.', lower(v_tier_label))
      end,
    'tierSummary',
      case
        when coalesce(array_length(v_current_labels, 1), 0) > 0 then format('Bu katmanda: %s.', array_to_string(v_current_labels, ', '))
        when v_tier_level = 0 then 'Core katman temel urun haklarini acik tutar.'
        else 'Bu katmanda su an aktif feature yok.'
      end,
    'currentBenefits', to_jsonb(v_current_labels),
    'nextTierSummary',
      case
        when v_next_tier_level is null then 'Maksimum seviyedesin.'
        else format('Siradaki katman: %s', v_next_tier_label)
      end,
    'nextTierBenefits', to_jsonb(v_next_labels),
    'nextTierCallout',
      case
        when v_next_tier_level is null then 'Yeni takviyeler mevcut prestiji ve supporter ritmini korur.'
        when coalesce(array_length(v_next_labels, 1), 0) > 0 then format('Siradaki acilimlar: %s.', array_to_string(v_next_labels, ', '))
        else 'Siradaki katman su an bos; policy editorunden doldurulabilir.'
      end
  );

  return v_result;
end;
$$;

grant execute on function public.build_fansub_boost_capabilities(integer) to anon, authenticated;

create or replace function public.refresh_all_fansub_boost_snapshot_capabilities()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer := 0;
begin
  update public.fansub_boost_snapshots as snapshot
  set
    capabilities = public.build_fansub_boost_capabilities(snapshot.tier_level),
    updated_at = now()
  where snapshot.fansub_id is not null;

  get diagnostics v_affected = row_count;
  return coalesce(v_affected, 0);
end;
$$;

create or replace function public.list_public_fansub_boost_capability_policies()
returns table (
  capability_key text,
  label text,
  summary text,
  detail text,
  placement_hint text,
  surface_group text,
  placement_type text,
  tier_level integer,
  sort_order integer
)
language sql
stable
set search_path = public
as $$
  select
    policy.capability_key,
    policy.label,
    policy.summary,
    policy.detail,
    policy.placement_hint,
    policy.surface_group,
    policy.placement_type,
    policy.tier_level,
    policy.sort_order
  from public.fansub_boost_capability_policies as policy
  order by policy.sort_order asc, policy.capability_key asc;
$$;

grant execute on function public.list_public_fansub_boost_capability_policies() to anon, authenticated;

create or replace function public.update_admin_boost_capability_policy(
  p_capability_key text,
  p_placement_type text,
  p_tier_level integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capability_key text := nullif(trim(coalesce(p_capability_key, '')), '');
  v_placement_type text := lower(trim(coalesce(p_placement_type, '')));
  v_tier_level integer := case
    when lower(trim(coalesce(p_placement_type, ''))) = 'tier' then greatest(1, least(coalesce(p_tier_level, 1), 3))
    else null
  end;
  v_payload jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if v_capability_key is null then
    raise exception 'Capability anahtari zorunludur.';
  end if;

  if v_placement_type not in ('core', 'tier', 'disabled') then
    raise exception 'Gecersiz yerlesim tipi.';
  end if;

  if not exists (
    select 1
    from public.fansub_boost_capability_policies as policy
    where policy.capability_key = v_capability_key
  ) then
    raise exception 'Capability bulunamadi.';
  end if;

  update public.fansub_boost_capability_policies as policy
  set
    placement_type = v_placement_type,
    tier_level = v_tier_level,
    updated_at = now()
  where policy.capability_key = v_capability_key;

  perform public.refresh_all_fansub_boost_snapshot_capabilities();

  with target_policy as (
    select *
    from public.fansub_boost_capability_policies as policy
    where policy.capability_key = v_capability_key
  ),
  base_fansubs as (
    select
      f.id,
      coalesce(snapshot.tier_level, 0)::integer as tier_level,
      coalesce(snapshot.capabilities, '{}'::jsonb) as capabilities
    from public.fansubs as f
    left join public.fansub_boost_snapshots as snapshot
      on snapshot.fansub_id = f.id
    where f.is_active = true
  )
  select jsonb_build_object(
    'capabilityKey', target_policy.capability_key,
    'label', target_policy.label,
    'summary', target_policy.summary,
    'detail', target_policy.detail,
    'where', target_policy.placement_hint,
    'surfaceGroup', target_policy.surface_group,
    'placementType', target_policy.placement_type,
    'tierLevel', target_policy.tier_level,
    'sortOrder', target_policy.sort_order,
    'eligibleFansubCount', case
      when target_policy.placement_type = 'core' then (select count(*)::integer from base_fansubs)
      when target_policy.placement_type = 'tier' then (
        select count(*)::integer
        from base_fansubs as base
        where base.tier_level >= coalesce(target_policy.tier_level, 99)
      )
      else 0
    end,
    'liveFansubCount', (
      select count(*)::integer
      from base_fansubs as base
      where coalesce((base.capabilities ->> target_policy.capability_key)::boolean, false)
    )
  )
  into v_payload
  from target_policy;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

grant execute on function public.update_admin_boost_capability_policy(text, text, integer) to authenticated;

create or replace function public.get_admin_boost_control_center()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  with base_fansubs as (
    select
      f.id,
      f.name,
      f.slug,
      f.is_active,
      f.active_background_id,
      f.custom_background_asset_url,
      f.active_name_style,
      f.vanity_slug_changed_at,
      coalesce(snapshot.active_power, 0)::integer as active_power,
      coalesce(snapshot.tier_level, 0)::integer as tier_level,
      coalesce(snapshot.active_supporter_count, 0)::integer as active_supporter_count,
      coalesce(snapshot.active_grant_count, 0)::integer as active_grant_count,
      coalesce(snapshot.capabilities, '{}'::jsonb) as capabilities,
      snapshot.updated_at as snapshot_updated_at
    from public.fansubs as f
    left join public.fansub_boost_snapshots as snapshot
      on snapshot.fansub_id = f.id
    where f.is_active = true
  ),
  capability_policy_rows as (
    select
      policy.capability_key,
      policy.label,
      policy.summary,
      policy.detail,
      policy.placement_hint,
      policy.surface_group,
      policy.placement_type,
      policy.tier_level,
      policy.sort_order,
      public.describe_fansub_boost_policy_placement(policy.placement_type, policy.tier_level) as placement_label,
      case
        when policy.placement_type = 'core' then (select count(*)::integer from base_fansubs)
        when policy.placement_type = 'tier' then (
          select count(*)::integer
          from base_fansubs as base
          where base.tier_level >= coalesce(policy.tier_level, 99)
        )
        else 0
      end as eligible_fansub_count,
      (
        select count(*)::integer
        from base_fansubs as base
        where coalesce((base.capabilities ->> policy.capability_key)::boolean, false)
      ) as live_fansub_count
    from public.fansub_boost_capability_policies as policy
  ),
  active_grants as (
    select
      grant_row.fansub_id,
      grant_row.supporter_user_id,
      grant_row.boost_power,
      grant_row.granted_at,
      grant_row.expires_at
    from public.fansub_boost_grants as grant_row
    where grant_row.status = 'active'
      and grant_row.starts_at <= now()
      and grant_row.expires_at > now()
  ),
  grant_metrics as (
    select
      count(*) filter (where grant_row.granted_at >= now() - interval '7 days')::integer as grant_count_7d,
      count(*) filter (where grant_row.granted_at >= now() - interval '30 days')::integer as grant_count_30d,
      coalesce(sum(grant_row.boost_power) filter (where grant_row.granted_at >= now() - interval '30 days'), 0)::integer as granted_power_30d,
      max(grant_row.granted_at) as last_grant_at
    from public.fansub_boost_grants as grant_row
  ),
  donation_metrics as (
    select
      count(*) filter (where txn.created_at >= now() - interval '30 days')::integer as donation_count_30d,
      coalesce(sum(txn.amount) filter (where txn.created_at >= now() - interval '30 days'), 0)::integer as donation_amount_30d,
      max(txn.created_at) as last_donation_at
    from public.fansub_transactions as txn
    where txn.type = 'donation'
  ),
  reward_metrics as (
    select
      count(*) filter (
        where state.active_grant_count > 0
          and coalesce((state.reward_capabilities ->> 'isFoundingSupporter')::boolean, false)
      )::integer as active_founding_supporter_count,
      count(*) filter (
        where state.active_grant_count > 0
          and greatest(coalesce((state.reward_capabilities ->> 'streakCount')::integer, 0), 0) >= 2
      )::integer as active_streak_supporter_count,
      count(*) filter (where state.active_grant_count > 0 and state.lifetime_grant_count >= 2)::integer as repeat_supporter_count
    from public.fansub_boost_supporter_states as state
  ),
  tier_rows as (
    select jsonb_agg(
      jsonb_build_object(
        'tierLevel', tier_row.tier_level,
        'tierLabel', case tier_row.tier_level
          when 3 then 'Seviye 3'
          when 2 then 'Seviye 2'
          when 1 then 'Seviye 1'
          else 'Core'
        end,
        'fansubCount', tier_row.fansub_count,
        'totalPower', tier_row.total_power,
        'totalSupporters', tier_row.total_supporters
      )
      order by tier_row.tier_level asc
    ) as rows
    from (
      select
        base.tier_level,
        count(*)::integer as fansub_count,
        coalesce(sum(base.active_power), 0)::integer as total_power,
        coalesce(sum(base.active_supporter_count), 0)::integer as total_supporters
      from base_fansubs as base
      group by base.tier_level
    ) as tier_row
  ),
  top_fansubs as (
    select jsonb_agg(
      jsonb_build_object(
        'fansubId', row_data.id,
        'name', row_data.name,
        'slug', row_data.slug,
        'tierLevel', row_data.tier_level,
        'activePower', row_data.active_power,
        'activeSupporterCount', row_data.active_supporter_count,
        'lastGrantAt', row_data.last_grant_at
      )
      order by row_data.active_power desc, row_data.active_supporter_count desc, row_data.name asc
    ) as rows
    from (
      select
        base.id,
        base.name,
        base.slug,
        base.tier_level,
        base.active_power,
        base.active_supporter_count,
        last_activity.last_grant_at
      from base_fansubs as base
      left join (
        select
          grant_row.fansub_id,
          max(grant_row.granted_at) as last_grant_at
        from public.fansub_boost_grants as grant_row
        group by grant_row.fansub_id
      ) as last_activity
        on last_activity.fansub_id = base.id
      where base.active_power > 0
      order by base.active_power desc, base.active_supporter_count desc, base.name asc
      limit 8
    ) as row_data
  ),
  chapter_credit_metrics as (
    select
      count(*) filter (where settings.is_enabled)::integer as enabled_count,
      count(*) filter (where settings.updated_at >= now() - interval '30 days')::integer as updated_30d
    from public.fansub_chapter_credit_settings as settings
  ),
  chapter_credit_override_metrics as (
    select
      count(distinct credit_override.fansub_id)::integer as touched_fansub_count_30d
    from public.fansub_chapter_credit_overrides as credit_override
    where credit_override.updated_at >= now() - interval '30 days'
  ),
  special_notification_metrics as (
    select
      count(*)::integer as sent_count_30d,
      count(distinct broadcast.fansub_id)::integer as fansub_count_30d
    from public.fansub_special_notification_broadcasts as broadcast
    where broadcast.created_at >= now() - interval '30 days'
  ),
  vanity_metrics as (
    select
      count(*) filter (where coalesce((base.capabilities ->> 'hasVanityUrl')::boolean, false))::integer as active_count,
      count(*) filter (
        where coalesce((base.capabilities ->> 'hasVanityUrl')::boolean, false)
          and base.vanity_slug_changed_at is not null
          and base.vanity_slug_changed_at >= now() - interval '30 days'
      )::integer as changed_30d
    from base_fansubs as base
  ),
  capability_policy_payload as (
    select jsonb_agg(
      jsonb_build_object(
        'capabilityKey', row_data.capability_key,
        'label', row_data.label,
        'summary', row_data.summary,
        'detail', row_data.detail,
        'where', row_data.placement_hint,
        'surfaceGroup', row_data.surface_group,
        'placementType', row_data.placement_type,
        'tierLevel', row_data.tier_level,
        'sortOrder', row_data.sort_order,
        'eligibleFansubCount', row_data.eligible_fansub_count,
        'liveFansubCount', row_data.live_fansub_count
      )
      order by row_data.sort_order asc, row_data.capability_key asc
    ) as rows
    from capability_policy_rows as row_data
  ),
  surface_rows as (
    select jsonb_agg(
      jsonb_build_object(
        'key', surface_row.key,
        'label', surface_row.label,
        'tierLabel', surface_row.tier_label,
        'modeLabel', surface_row.mode_label,
        'placement', surface_row.placement,
        'eligibleFansubCount', surface_row.eligible_fansub_count,
        'liveFansubCount', surface_row.live_fansub_count,
        'usageLast30d', surface_row.usage_last_30d
      )
      order by surface_row.sort_order asc
    ) as rows
    from (
      select
        10 as sort_order,
        'supporter_summary'::text as key,
        'Destek ozeti'::text as label,
        coalesce((select placement_label from capability_policy_rows where capability_key = 'canUseSupporterList'), 'Core')::text as tier_label,
        'Oto'::text as mode_label,
        'Takviye sekmesi, detay, kapanis seridi'::text as placement,
        (select eligible_fansub_count from capability_policy_rows where capability_key = 'canUseSupporterList') as eligible_fansub_count,
        (select live_fansub_count from capability_policy_rows where capability_key = 'canUseSupporterList') as live_fansub_count,
        null::integer as usage_last_30d

      union all

      select
        20,
        'chapter_end_credit',
        'Kapanis seridi',
        coalesce((select placement_label from capability_policy_rows where capability_key = 'hasChapterEndCredit'), 'Core'),
        'Ayar',
        'Reader sonu',
        (select eligible_fansub_count from capability_policy_rows where capability_key = 'hasChapterEndCredit'),
        coalesce((select enabled_count from chapter_credit_metrics), 0),
        coalesce((select greatest(coalesce(updated_30d, 0), coalesce((select touched_fansub_count_30d from chapter_credit_override_metrics), 0)) from chapter_credit_metrics), 0)

      union all

      select
        30,
        'background_family',
        'Arka plan ailesi',
        case
          when (select placement_label from capability_policy_rows where capability_key = 'canUploadStaticBackground')
             = (select placement_label from capability_policy_rows where capability_key = 'canUploadVideoBackground')
            then coalesce((select placement_label from capability_policy_rows where capability_key = 'canUploadStaticBackground'), 'Kapali')
          else 'Karisik'
        end,
        'Ayar',
        'Fansub profil kahramani',
        greatest(
          coalesce((select eligible_fansub_count from capability_policy_rows where capability_key = 'canUploadStaticBackground'), 0),
          coalesce((select eligible_fansub_count from capability_policy_rows where capability_key = 'canUploadVideoBackground'), 0)
        ),
        (select count(*)::integer from base_fansubs where active_background_id is not null or custom_background_asset_url is not null),
        null::integer

      union all

      select
        40,
        'community_badge',
        'Topluluk destekli rozeti',
        coalesce((select placement_label from capability_policy_rows where capability_key = 'hasDiscoverBadge'), 'Kapali'),
        'Oto',
        'Profil, katalog, hover',
        (select eligible_fansub_count from capability_policy_rows where capability_key = 'hasDiscoverBadge'),
        (select live_fansub_count from capability_policy_rows where capability_key = 'hasDiscoverBadge'),
        null::integer

      union all

      select
        50,
        'name_style',
        'Isim stili',
        coalesce((select placement_label from capability_policy_rows where capability_key = 'hasFullNameStyle'), 'Kapali'),
        'Ayar',
        'Profil, katalog, hover',
        (select eligible_fansub_count from capability_policy_rows where capability_key = 'hasFullNameStyle'),
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'hasFullNameStyle')::boolean, false) and active_name_style is not null),
        null::integer

      union all

      select
        60,
        'special_notifications',
        'Ozel bildirim',
        coalesce((select placement_label from capability_policy_rows where capability_key = 'canUseSpecialNotifications'), 'Kapali'),
        'Aksiyon',
        'Takipci bildirimi',
        (select eligible_fansub_count from capability_policy_rows where capability_key = 'canUseSpecialNotifications'),
        coalesce((select fansub_count_30d from special_notification_metrics), 0),
        coalesce((select sent_count_30d from special_notification_metrics), 0)

      union all

      select
        70,
        'boost_frame',
        'Takviye cercevesi',
        coalesce((select placement_label from capability_policy_rows where capability_key = 'hasGoldFrame'), 'Kapali'),
        'Oto',
        'Profil kahramani',
        (select eligible_fansub_count from capability_policy_rows where capability_key = 'hasGoldFrame'),
        (select live_fansub_count from capability_policy_rows where capability_key = 'hasGoldFrame'),
        null::integer

      union all

      select
        80,
        'vanity_url',
        'Ozel URL',
        coalesce((select placement_label from capability_policy_rows where capability_key = 'hasVanityUrl'), 'Kapali'),
        'Ayar',
        'Public fansub rotasi',
        (select eligible_fansub_count from capability_policy_rows where capability_key = 'hasVanityUrl'),
        coalesce((select active_count from vanity_metrics), 0),
        coalesce((select changed_30d from vanity_metrics), 0)

      union all

      select
        90,
        'advanced_analytics',
        'Gelismis analiz',
        coalesce((select placement_label from capability_policy_rows where capability_key = 'hasAdvancedAnalytics'), 'Kapali'),
        'Oto',
        'Yonetim istatistikleri',
        (select eligible_fansub_count from capability_policy_rows where capability_key = 'hasAdvancedAnalytics'),
        (select live_fansub_count from capability_policy_rows where capability_key = 'hasAdvancedAnalytics'),
        null::integer
    ) as surface_row
  ),
  health_payload as (
    select jsonb_build_object(
      'expiringGrantCount7d', (
        select count(*)::integer
        from active_grants as active_grant
        where active_grant.expires_at <= now() + interval '7 days'
      ),
      'staleSnapshotCount', (
        select count(*)::integer
        from base_fansubs as base
        where base.active_power > 0
          and (base.snapshot_updated_at is null or base.snapshot_updated_at < now() - interval '48 hours')
      ),
      'missingRewardStateCount', (
        select count(*)::integer
        from (
          select distinct
            active_grant.fansub_id,
            active_grant.supporter_user_id
          from active_grants as active_grant
        ) as pair_row
        left join public.fansub_boost_supporter_states as state
          on state.fansub_id = pair_row.fansub_id
         and state.supporter_user_id = pair_row.supporter_user_id
        where state.fansub_id is null or coalesce(state.active_grant_count, 0) <= 0
      ),
      'chapterCreditEnabledCount', coalesce((select enabled_count from chapter_credit_metrics), 0),
      'specialNotificationCount30d', coalesce((select sent_count_30d from special_notification_metrics), 0),
      'activeVanityCount', coalesce((select active_count from vanity_metrics), 0),
      'lastGrantAt', (select last_grant_at from grant_metrics),
      'lastDonationAt', (select last_donation_at from donation_metrics)
    ) as payload
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'policy', jsonb_build_object(
      'tierThresholds', jsonb_build_array(3, 6, 12),
      'foundingLimit', 10,
      'streakGraceDays', 7
    ),
    'capabilityPolicies', coalesce((select rows from capability_policy_payload), '[]'::jsonb),
    'overview', jsonb_build_object(
      'totalFansubCount', (select count(*)::integer from base_fansubs),
      'boostedFansubCount', (select count(*)::integer from base_fansubs where active_power > 0),
      'totalActivePower', (select coalesce(sum(active_power), 0)::integer from base_fansubs),
      'uniqueActiveSupporterCount', (select count(distinct supporter_user_id)::integer from active_grants),
      'activeGrantCount', (select count(*)::integer from active_grants),
      'grantCount7d', coalesce((select grant_count_7d from grant_metrics), 0),
      'grantCount30d', coalesce((select grant_count_30d from grant_metrics), 0),
      'grantedPower30d', coalesce((select granted_power_30d from grant_metrics), 0),
      'donationCount30d', coalesce((select donation_count_30d from donation_metrics), 0),
      'donationAmount30d', coalesce((select donation_amount_30d from donation_metrics), 0),
      'activeFoundingSupporterCount', coalesce((select active_founding_supporter_count from reward_metrics), 0),
      'activeStreakSupporterCount', coalesce((select active_streak_supporter_count from reward_metrics), 0),
      'repeatSupporterCount', coalesce((select repeat_supporter_count from reward_metrics), 0)
    ),
    'tiers', coalesce((select rows from tier_rows), '[]'::jsonb),
    'surfaces', coalesce((select rows from surface_rows), '[]'::jsonb),
    'topFansubs', coalesce((select rows from top_fansubs), '[]'::jsonb),
    'health', coalesce((select payload from health_payload), '{}'::jsonb)
  )
  into v_payload;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

grant execute on function public.get_admin_boost_control_center() to authenticated;

select public.refresh_all_fansub_boost_snapshot_capabilities();

commit;
