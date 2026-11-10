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
  inventory as (
    select *
    from public.list_admin_supporter_asset_inventory(null)
  ),
  activity as (
    select *
    from public.list_admin_supporter_asset_activity(null)
  ),
  recent_fansub_activity as (
    select distinct on (activity_row.fansub_id)
      activity_row.fansub_id,
      activity_row.actor_user_id,
      activity_row.actor_username,
      activity_row.actor_avatar_url,
      activity_row.occurred_at
    from activity as activity_row
    order by
      activity_row.fansub_id asc,
      activity_row.occurred_at desc,
      activity_row.asset_id desc
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
  overview_payload as (
    select jsonb_build_object(
      'fansubCountWithAssets', count(distinct inventory_row.fansub_id) filter (where not inventory_row.is_archived)::integer,
      'totalAssetCount', count(*)::integer,
      'totalEmojiCount', count(*) filter (where inventory_row.asset_kind = 'emoji' and not inventory_row.is_archived)::integer,
      'totalStickerCount', count(*) filter (where inventory_row.asset_kind = 'sticker' and not inventory_row.is_archived)::integer,
      'usableAssetCount', count(*) filter (where inventory_row.is_usable)::integer,
      'quotaOutsideAssetCount', count(*) filter (where not inventory_row.is_archived and not inventory_row.is_within_quota)::integer,
      'revisedAssetCount', count(*) filter (where coalesce(inventory_row.current_revision_number, 0) > 1)::integer,
      'uploadCount30d', count(*) filter (
        where inventory_row.created_at >= now() - interval '30 days'
      )::integer,
      'editCount30d', count(*) filter (
        where inventory_row.current_revision_number > 1
          and inventory_row.current_revision_created_at >= now() - interval '30 days'
      )::integer
    ) as payload
    from inventory as inventory_row
  ),
  top_fansub_inventory_summary as (
    select
      inventory_row.fansub_id,
      inventory_row.fansub_name,
      inventory_row.fansub_slug,
      max(inventory_row.tier_level)::integer as tier_level,
      count(*) filter (where inventory_row.asset_kind = 'emoji' and not inventory_row.is_archived)::integer as emoji_count,
      count(*) filter (where inventory_row.asset_kind = 'sticker' and not inventory_row.is_archived)::integer as sticker_count,
      count(*)::integer as total_asset_count,
      count(*) filter (where not inventory_row.is_archived)::integer as live_asset_count,
      count(*) filter (where inventory_row.is_archived)::integer as archived_asset_count,
      count(*) filter (where inventory_row.is_usable)::integer as usable_asset_count,
      max(greatest(inventory_row.updated_at, inventory_row.created_at)) as last_asset_at
    from inventory as inventory_row
    group by
      inventory_row.fansub_id,
      inventory_row.fansub_name,
      inventory_row.fansub_slug
  ),
  top_fansub_activity_summary as (
    select
      activity_row.fansub_id,
      max(activity_row.occurred_at) as last_activity_at
    from activity as activity_row
    group by activity_row.fansub_id
  ),
  top_fansub_ranked as (
    select
      summary_row.fansub_id,
      summary_row.fansub_name,
      summary_row.fansub_slug,
      summary_row.tier_level,
      summary_row.emoji_count,
      summary_row.sticker_count,
      summary_row.total_asset_count,
      summary_row.live_asset_count,
      summary_row.archived_asset_count,
      summary_row.usable_asset_count,
      summary_row.last_asset_at,
      activity_summary.last_activity_at,
      recent_activity.actor_user_id,
      recent_activity.actor_username,
      recent_activity.actor_avatar_url
    from top_fansub_inventory_summary as summary_row
    left join top_fansub_activity_summary as activity_summary
      on activity_summary.fansub_id = summary_row.fansub_id
    left join recent_fansub_activity as recent_activity
      on recent_activity.fansub_id = summary_row.fansub_id
    order by
      summary_row.live_asset_count desc,
      summary_row.usable_asset_count desc,
      summary_row.fansub_name asc
    limit 12
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
        'liveAssetCount', row_data.live_asset_count,
        'archivedAssetCount', row_data.archived_asset_count,
        'usableAssetCount', row_data.usable_asset_count,
        'lastAssetAt', row_data.last_asset_at,
        'lastActivityAt', row_data.last_activity_at,
        'lastActor', case
          when row_data.actor_user_id is null then null
          else jsonb_build_object(
            'userId', row_data.actor_user_id,
            'username', row_data.actor_username,
            'avatarUrl', row_data.actor_avatar_url
          )
        end
      )
      order by row_data.live_asset_count desc, row_data.usable_asset_count desc, row_data.fansub_name asc
    ) as rows
    from top_fansub_ranked as row_data
  ),
  latest_assets_payload as (
    select jsonb_agg(
      jsonb_build_object(
        'assetId', row_data.asset_id,
        'fansubId', row_data.fansub_id,
        'fansubName', row_data.fansub_name,
        'fansubSlug', row_data.fansub_slug,
        'tierLevel', row_data.tier_level,
        'assetKind', row_data.asset_kind,
        'shortcode', row_data.shortcode,
        'label', row_data.label,
        'assetRef', row_data.asset_ref,
        'mimeType', row_data.mime_type,
        'width', row_data.width,
        'height', row_data.height,
        'sizeBytes', row_data.size_bytes,
        'presentation', row_data.presentation,
        'isActive', row_data.is_active,
        'isArchived', row_data.is_archived,
        'quotaLimit', row_data.quota_limit,
        'quotaRank', row_data.quota_rank,
        'isWithinQuota', row_data.is_within_quota,
        'isUsable', row_data.is_usable,
        'currentRevisionId', row_data.current_revision_id,
        'currentRevisionNumber', row_data.current_revision_number,
        'latestRevisionNumber', row_data.latest_revision_number,
        'currentRevisionCreatedAt', row_data.current_revision_created_at,
        'currentRevisionCreatedBy', case
          when row_data.current_revision_created_by is null then null
          else jsonb_build_object(
            'userId', row_data.current_revision_created_by,
            'username', row_data.current_revision_created_by_username,
            'avatarUrl', row_data.current_revision_created_by_avatar_url
          )
        end,
        'createdBy', case
          when row_data.created_by is null then null
          else jsonb_build_object(
            'userId', row_data.created_by,
            'username', row_data.created_by_username,
            'avatarUrl', row_data.created_by_avatar_url
          )
        end,
        'updatedBy', case
          when row_data.updated_by is null then null
          else jsonb_build_object(
            'userId', row_data.updated_by,
            'username', row_data.updated_by_username,
            'avatarUrl', row_data.updated_by_avatar_url
          )
        end,
        'deletedBy', case
          when row_data.deleted_by is null then null
          else jsonb_build_object(
            'userId', row_data.deleted_by,
            'username', row_data.deleted_by_username,
            'avatarUrl', row_data.deleted_by_avatar_url
          )
        end,
        'createdAt', row_data.created_at,
        'updatedAt', row_data.updated_at,
        'deletedAt', row_data.deleted_at
      )
      order by row_data.updated_at desc, row_data.created_at desc, row_data.asset_id desc
    ) as rows
    from (
      select *
      from inventory as inventory_row
      order by inventory_row.updated_at desc, inventory_row.created_at desc, inventory_row.asset_id desc
      limit 18
    ) as row_data
  ),
  top_uploaders_payload as (
    select jsonb_agg(
      jsonb_build_object(
        'user', jsonb_build_object(
          'userId', row_data.actor_user_id,
          'username', row_data.actor_username,
          'avatarUrl', row_data.actor_avatar_url
        ),
        'uploadCount30d', row_data.upload_count_30d,
        'editCount30d', row_data.edit_count_30d,
        'fansubCount30d', row_data.fansub_count_30d,
        'lastActivityAt', row_data.last_activity_at
      )
      order by row_data.upload_count_30d desc, row_data.edit_count_30d desc, row_data.last_activity_at desc
    ) as rows
    from (
      select
        activity_row.actor_user_id,
        activity_row.actor_username,
        activity_row.actor_avatar_url,
        count(*) filter (
          where activity_row.event_type = 'upload'
            and activity_row.occurred_at >= now() - interval '30 days'
        )::integer as upload_count_30d,
        count(*) filter (
          where activity_row.event_type = 'edit'
            and activity_row.occurred_at >= now() - interval '30 days'
        )::integer as edit_count_30d,
        count(distinct activity_row.fansub_id) filter (
          where activity_row.occurred_at >= now() - interval '30 days'
        )::integer as fansub_count_30d,
        max(activity_row.occurred_at) as last_activity_at
      from activity as activity_row
      where activity_row.actor_user_id is not null
        and activity_row.event_type in ('upload', 'edit')
      group by
        activity_row.actor_user_id,
        activity_row.actor_username,
        activity_row.actor_avatar_url
      order by upload_count_30d desc, edit_count_30d desc, last_activity_at desc
      limit 8
    ) as row_data
  ),
  recent_activity_payload as (
    select jsonb_agg(
      jsonb_build_object(
        'eventType', row_data.event_type,
        'eventLabel', row_data.event_label,
        'assetId', row_data.asset_id,
        'fansubId', row_data.fansub_id,
        'fansubName', row_data.fansub_name,
        'fansubSlug', row_data.fansub_slug,
        'assetKind', row_data.asset_kind,
        'shortcode', row_data.shortcode,
        'label', row_data.label,
        'actor', case
          when row_data.actor_user_id is null then null
          else jsonb_build_object(
            'userId', row_data.actor_user_id,
            'username', row_data.actor_username,
            'avatarUrl', row_data.actor_avatar_url
          )
        end,
        'occurredAt', row_data.occurred_at,
        'revisionNumber', row_data.revision_number
      )
      order by row_data.occurred_at desc, row_data.asset_id desc
    ) as rows
    from (
      select *
      from activity
      order by occurred_at desc, asset_id desc
      limit 18
    ) as row_data
  ),
  health_payload as (
    select jsonb_build_object(
      'inactiveAssetCount', count(*) filter (where not inventory_row.is_active and not inventory_row.is_archived)::integer,
      'archivedAssetCount', count(*) filter (where inventory_row.is_archived)::integer,
      'quotaOutsideAssetCount', count(*) filter (where not inventory_row.is_archived and not inventory_row.is_within_quota)::integer,
      'missingRevisionCount', count(*) filter (
        where inventory_row.current_revision_id is null or inventory_row.current_revision_number is null
      )::integer,
      'missingActorCount', count(*) filter (where inventory_row.created_by is null)::integer,
      'legacyRefCount', count(*) filter (where inventory_row.asset_ref not like 'store-assets://fansubs/%/supporter-assets/%')::integer,
      'gifAssetCount', count(*) filter (where inventory_row.mime_type = 'image/gif' and not inventory_row.is_archived)::integer,
      'standardizedRefCount', count(*) filter (where inventory_row.asset_ref like 'store-assets://fansubs/%/supporter-assets/%')::integer,
      'lastAssetAt', max(greatest(inventory_row.updated_at, inventory_row.created_at))
    ) as payload
    from inventory as inventory_row
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
    'topUploaders', coalesce((select rows from top_uploaders_payload), '[]'::jsonb),
    'recentActivity', coalesce((select rows from recent_activity_payload), '[]'::jsonb),
    'health', coalesce((select payload from health_payload), '{}'::jsonb)
  )
  into v_payload;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

grant execute on function public.get_admin_supporter_asset_control_center() to authenticated;

commit;
