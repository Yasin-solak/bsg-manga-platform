begin;

create or replace function public.get_admin_supporter_asset_control_center()
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
      coalesce(snapshot.tier_level, 0)::integer as tier_level,
      coalesce(snapshot.capabilities, public.build_fansub_boost_capabilities(0)) as capabilities
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
    where policy.capability_key in ('canUseSupporterEmojiAssets', 'canUseSupporterStickerAssets')
  ),
  ranked_assets as (
    select
      asset.id,
      asset.fansub_id,
      base.name as fansub_name,
      base.slug as fansub_slug,
      base.tier_level,
      asset.asset_kind,
      asset.shortcode,
      asset.label,
      asset.asset_ref,
      asset.mime_type,
      asset.presentation,
      asset.is_active,
      asset.sort_order,
      asset.current_revision_id,
      current_revision.revision_number as current_revision_number,
      asset.created_at,
      asset.updated_at,
      row_number() over (
        partition by asset.fansub_id, asset.asset_kind
        order by asset.sort_order asc, asset.created_at asc, asset.id asc
      )::integer as quota_rank,
      public.resolve_fansub_supporter_asset_limit(base.capabilities, asset.asset_kind) as quota_limit
    from public.fansub_supporter_assets as asset
    join base_fansubs as base
      on base.id = asset.fansub_id
    left join public.fansub_supporter_asset_revisions as current_revision
      on current_revision.id = asset.current_revision_id
    where asset.deleted_at is null
  ),
  asset_inventory as (
    select
      ranked.id,
      ranked.fansub_id,
      ranked.fansub_name,
      ranked.fansub_slug,
      ranked.tier_level,
      ranked.asset_kind,
      ranked.shortcode,
      ranked.label,
      ranked.asset_ref,
      ranked.mime_type,
      ranked.presentation,
      ranked.is_active,
      ranked.sort_order,
      ranked.current_revision_id,
      ranked.current_revision_number,
      ranked.created_at,
      ranked.updated_at,
      ranked.quota_rank,
      ranked.quota_limit,
      (ranked.quota_rank <= ranked.quota_limit) as is_within_quota,
      (
        ranked.is_active
        and ranked.quota_limit > 0
        and ranked.quota_rank <= ranked.quota_limit
      ) as is_usable,
      (ranked.current_revision_id is null or ranked.current_revision_number is null) as is_missing_revision,
      (coalesce(ranked.current_revision_number, 0) > 1) as is_revised,
      (ranked.asset_ref like 'store-assets://fansubs/%/supporter-assets/%') as is_standardized_ref
    from ranked_assets as ranked
  ),
  tier_quota_rows as (
    select jsonb_agg(
      jsonb_build_object(
        'tierLevel', quota_row.tier_level,
        'tierLabel', quota_row.tier_label,
        'emojiLimit', quota_row.emoji_limit,
        'stickerLimit', quota_row.sticker_limit
      )
      order by quota_row.tier_level asc
    ) as rows
    from (
      select
        tier_level.value as tier_level,
        case tier_level.value
          when 3 then 'Seviye 3'
          when 2 then 'Seviye 2'
          when 1 then 'Seviye 1'
          else 'Core'
        end as tier_label,
        public.get_fansub_supporter_asset_tier_quota('emoji', tier_level.value) as emoji_limit,
        public.get_fansub_supporter_asset_tier_quota('sticker', tier_level.value) as sticker_limit
      from generate_series(0, 3) as tier_level(value)
    ) as quota_row
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
        'placementLabel', row_data.placement_label,
        'eligibleFansubCount', row_data.eligible_fansub_count,
        'liveFansubCount', row_data.live_fansub_count
      )
      order by row_data.sort_order asc
    ) as rows
    from capability_policy_rows as row_data
  ),
  overview_payload as (
    select jsonb_build_object(
      'fansubCountWithAssets', count(distinct inventory.fansub_id)::integer,
      'totalAssetCount', count(*)::integer,
      'totalEmojiCount', count(*) filter (where inventory.asset_kind = 'emoji')::integer,
      'totalStickerCount', count(*) filter (where inventory.asset_kind = 'sticker')::integer,
      'usableAssetCount', count(*) filter (where inventory.is_usable)::integer,
      'quotaOutsideAssetCount', count(*) filter (where not inventory.is_within_quota)::integer,
      'revisedAssetCount', count(*) filter (where inventory.is_revised)::integer,
      'uploadCount30d', count(*) filter (where inventory.created_at >= now() - interval '30 days')::integer,
      'editCount30d', count(*) filter (
        where inventory.updated_at >= now() - interval '30 days'
          and inventory.updated_at > inventory.created_at
      )::integer
    ) as payload
    from asset_inventory as inventory
  ),
  top_fansubs_payload as (
    select jsonb_agg(
      jsonb_build_object(
        'fansubId', row_data.fansub_id,
        'name', row_data.fansub_name,
        'slug', row_data.fansub_slug,
        'tierLevel', row_data.tier_level,
        'emojiCount', row_data.emoji_count,
        'stickerCount', row_data.sticker_count,
        'totalAssetCount', row_data.total_asset_count,
        'usableAssetCount', row_data.usable_asset_count,
        'lastAssetAt', row_data.last_asset_at
      )
      order by row_data.total_asset_count desc, row_data.usable_asset_count desc, row_data.fansub_name asc
    ) as rows
    from (
      select
        inventory.fansub_id,
        inventory.fansub_name,
        inventory.fansub_slug,
        inventory.tier_level,
        count(*) filter (where inventory.asset_kind = 'emoji')::integer as emoji_count,
        count(*) filter (where inventory.asset_kind = 'sticker')::integer as sticker_count,
        count(*)::integer as total_asset_count,
        count(*) filter (where inventory.is_usable)::integer as usable_asset_count,
        max(greatest(inventory.updated_at, inventory.created_at)) as last_asset_at
      from asset_inventory as inventory
      group by
        inventory.fansub_id,
        inventory.fansub_name,
        inventory.fansub_slug,
        inventory.tier_level
      order by total_asset_count desc, usable_asset_count desc, inventory.fansub_name asc
      limit 12
    ) as row_data
  ),
  latest_assets_payload as (
    select jsonb_agg(
      jsonb_build_object(
        'assetId', row_data.id,
        'fansubId', row_data.fansub_id,
        'fansubName', row_data.fansub_name,
        'fansubSlug', row_data.fansub_slug,
        'tierLevel', row_data.tier_level,
        'assetKind', row_data.asset_kind,
        'shortcode', row_data.shortcode,
        'label', row_data.label,
        'assetRef', row_data.asset_ref,
        'mimeType', row_data.mime_type,
        'presentation', row_data.presentation,
        'isActive', row_data.is_active,
        'quotaLimit', row_data.quota_limit,
        'quotaRank', row_data.quota_rank,
        'isWithinQuota', row_data.is_within_quota,
        'isUsable', row_data.is_usable,
        'currentRevisionId', row_data.current_revision_id,
        'currentRevisionNumber', row_data.current_revision_number,
        'createdAt', row_data.created_at,
        'updatedAt', row_data.updated_at
      )
      order by row_data.updated_at desc, row_data.created_at desc, row_data.id asc
    ) as rows
    from (
      select *
      from asset_inventory as inventory
      order by inventory.updated_at desc, inventory.created_at desc, inventory.id asc
      limit 18
    ) as row_data
  ),
  health_payload as (
    select jsonb_build_object(
      'inactiveAssetCount', count(*) filter (where not inventory.is_active)::integer,
      'quotaOutsideAssetCount', count(*) filter (where not inventory.is_within_quota)::integer,
      'missingRevisionCount', count(*) filter (where inventory.is_missing_revision)::integer,
      'legacyRefCount', count(*) filter (where not inventory.is_standardized_ref)::integer,
      'gifAssetCount', count(*) filter (where inventory.mime_type = 'image/gif')::integer,
      'standardizedRefCount', count(*) filter (where inventory.is_standardized_ref)::integer,
      'lastAssetAt', max(greatest(inventory.updated_at, inventory.created_at))
    ) as payload
    from asset_inventory as inventory
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'transport', jsonb_build_object(
      'uploadPath', 'cloudflare',
      'assetRefScheme', 'store-assets://',
      'bucket', 'store-assets'
    ),
    'capabilityPolicies', coalesce((select rows from capability_policy_payload), '[]'::jsonb),
    'tierQuotas', coalesce((select rows from tier_quota_rows), '[]'::jsonb),
    'overview', coalesce((select payload from overview_payload), '{}'::jsonb),
    'topFansubs', coalesce((select rows from top_fansubs_payload), '[]'::jsonb),
    'latestAssets', coalesce((select rows from latest_assets_payload), '[]'::jsonb),
    'health', coalesce((select payload from health_payload), '{}'::jsonb)
  )
  into v_payload;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

grant execute on function public.get_admin_supporter_asset_control_center() to authenticated;

commit;
