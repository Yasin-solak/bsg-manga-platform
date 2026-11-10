begin;

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
      count(*) filter (where state.active_grant_count > 0)::integer as active_supporter_state_count,
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
      count(*) filter (where base.tier_level >= 3 and base.vanity_slug_changed_at is not null)::integer as active_count,
      count(*) filter (
        where base.tier_level >= 3
          and base.vanity_slug_changed_at is not null
          and base.vanity_slug_changed_at >= now() - interval '30 days'
      )::integer as changed_30d
    from base_fansubs as base
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
        'Core'::text as tier_label,
        'Oto'::text as mode_label,
        'Takviye sekmesi, detay, kapanis seridi'::text as placement,
        (select count(*)::integer from base_fansubs) as eligible_fansub_count,
        (select count(*)::integer from base_fansubs where active_supporter_count > 0) as live_fansub_count,
        null::integer as usage_last_30d

      union all

      select
        20,
        'chapter_end_credit',
        'Kapanis seridi',
        'Core',
        'Ayar',
        'Reader sonu',
        (select count(*)::integer from base_fansubs),
        coalesce((select enabled_count from chapter_credit_metrics), 0),
        coalesce((select greatest(coalesce(updated_30d, 0), coalesce((select touched_fansub_count_30d from chapter_credit_override_metrics), 0)) from chapter_credit_metrics), 0)

      union all

      select
        30,
        'background_family',
        'Arka plan ailesi',
        'Seviye 1',
        'Ayar',
        'Fansub profil kahramani',
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'canUploadStaticBackground')::boolean, false)),
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'canUploadStaticBackground')::boolean, false) and (active_background_id is not null or custom_background_asset_url is not null)),
        null::integer

      union all

      select
        40,
        'community_badge',
        'Topluluk destekli rozeti',
        'Seviye 1',
        'Oto',
        'Profil, katalog, hover',
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'hasDiscoverBadge')::boolean, false)),
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'hasDiscoverBadge')::boolean, false)),
        null::integer

      union all

      select
        50,
        'name_style',
        'Isim stili',
        'Seviye 2',
        'Ayar',
        'Profil, katalog, hover',
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'hasFullNameStyle')::boolean, false)),
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'hasFullNameStyle')::boolean, false) and active_name_style is not null),
        null::integer

      union all

      select
        60,
        'special_notifications',
        'Ozel bildirim',
        'Seviye 2',
        'Aksiyon',
        'Takipci bildirimi',
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'canUseSpecialNotifications')::boolean, false)),
        coalesce((select fansub_count_30d from special_notification_metrics), 0),
        coalesce((select sent_count_30d from special_notification_metrics), 0)

      union all

      select
        70,
        'boost_frame',
        'Takviye cercevesi',
        'Seviye 3',
        'Oto',
        'Profil kahramani',
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'hasGoldFrame')::boolean, false)),
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'hasGoldFrame')::boolean, false)),
        null::integer

      union all

      select
        80,
        'vanity_url',
        'Ozel URL',
        'Seviye 3',
        'Ayar',
        'Public fansub rotasi',
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'hasVanityUrl')::boolean, false)),
        coalesce((select active_count from vanity_metrics), 0),
        coalesce((select changed_30d from vanity_metrics), 0)

      union all

      select
        90,
        'advanced_analytics',
        'Gelismis analiz',
        'Seviye 3',
        'Oto',
        'Yonetim istatistikleri',
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'hasAdvancedAnalytics')::boolean, false)),
        (select count(*)::integer from base_fansubs where coalesce((capabilities ->> 'hasAdvancedAnalytics')::boolean, false)),
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

commit;
