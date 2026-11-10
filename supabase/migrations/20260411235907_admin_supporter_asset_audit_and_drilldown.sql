begin;

alter table public.fansub_supporter_assets
  add column if not exists updated_by uuid null references public.users (id) on delete set null,
  add column if not exists deleted_by uuid null references public.users (id) on delete set null;

with revision_backfill as (
  select
    asset.id as asset_id,
    legacy_revision.created_by as legacy_created_by,
    current_revision.created_by as current_created_by
  from public.fansub_supporter_assets as asset
  left join public.fansub_supporter_asset_revisions as legacy_revision
    on legacy_revision.id = asset.legacy_revision_id
  left join public.fansub_supporter_asset_revisions as current_revision
    on current_revision.id = asset.current_revision_id
)
update public.fansub_supporter_assets as asset
set
  created_by = coalesce(asset.created_by, revision_backfill.legacy_created_by, revision_backfill.current_created_by),
  updated_by = coalesce(asset.updated_by, revision_backfill.current_created_by, asset.created_by, revision_backfill.legacy_created_by)
from revision_backfill
where asset.id = revision_backfill.asset_id
  and (
    asset.created_by is null
    or asset.updated_by is null
  );

create index if not exists idx_fansub_supporter_assets_updated_at
  on public.fansub_supporter_assets (updated_at desc);

create index if not exists idx_fansub_supporter_assets_created_by
  on public.fansub_supporter_assets (created_by, created_at desc)
  where created_by is not null;

create index if not exists idx_fansub_supporter_assets_updated_by
  on public.fansub_supporter_assets (updated_by, updated_at desc)
  where updated_by is not null;

create index if not exists idx_fansub_supporter_asset_revisions_created_by
  on public.fansub_supporter_asset_revisions (created_by, created_at desc)
  where created_by is not null;

create or replace function public.set_fansub_supporter_asset_actor_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_public_user_id();
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, v_actor_id);
    new.updated_by := coalesce(new.updated_by, new.created_by, v_actor_id);
    if new.deleted_at is not null then
      new.deleted_by := coalesce(new.deleted_by, v_actor_id, new.updated_by, new.created_by);
    end if;
    return new;
  end if;

  new.updated_by := coalesce(v_actor_id, new.updated_by, old.updated_by, old.created_by);

  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_by := coalesce(v_actor_id, new.deleted_by, old.deleted_by, new.updated_by, old.updated_by, old.created_by);
  elsif new.deleted_at is null then
    new.deleted_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fansub_supporter_assets_actor_fields on public.fansub_supporter_assets;
create trigger trg_fansub_supporter_assets_actor_fields
  before insert or update on public.fansub_supporter_assets
  for each row
  execute function public.set_fansub_supporter_asset_actor_fields();

create or replace function public.list_admin_supporter_asset_inventory(
  p_fansub_id uuid default null
)
returns table (
  asset_id uuid,
  fansub_id uuid,
  fansub_name text,
  fansub_slug text,
  tier_level integer,
  asset_kind text,
  shortcode text,
  label text,
  asset_ref text,
  mime_type text,
  width integer,
  height integer,
  size_bytes integer,
  is_active boolean,
  is_archived boolean,
  sort_order integer,
  quota_limit integer,
  quota_rank integer,
  is_within_quota boolean,
  is_usable boolean,
  presentation jsonb,
  current_revision_id uuid,
  current_revision_number integer,
  latest_revision_number integer,
  current_revision_created_at timestamptz,
  current_revision_created_by uuid,
  current_revision_created_by_username text,
  current_revision_created_by_avatar_url text,
  created_by uuid,
  created_by_username text,
  created_by_avatar_url text,
  updated_by uuid,
  updated_by_username text,
  updated_by_avatar_url text,
  deleted_by uuid,
  deleted_by_username text,
  deleted_by_avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
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
    where public.is_admin()
      and (p_fansub_id is null or f.id = p_fansub_id)
  ),
  base_assets as (
    select
      asset.id as asset_id,
      asset.fansub_id,
      base.name as fansub_name,
      base.slug as fansub_slug,
      base.tier_level,
      asset.asset_kind,
      current_revision.shortcode,
      current_revision.label,
      current_revision.asset_ref,
      current_revision.mime_type,
      current_revision.width,
      current_revision.height,
      current_revision.size_bytes,
      coalesce(current_revision.presentation, '{}'::jsonb) as presentation,
      asset.is_active,
      asset.deleted_at is not null as is_archived,
      asset.sort_order,
      public.resolve_fansub_supporter_asset_limit(base.capabilities, asset.asset_kind) as quota_limit,
      asset.current_revision_id,
      current_revision.revision_number as current_revision_number,
      asset.latest_revision_number,
      current_revision.created_at as current_revision_created_at,
      current_revision.created_by as current_revision_created_by,
      current_revision_user.username as current_revision_created_by_username,
      current_revision_user.avatar_url as current_revision_created_by_avatar_url,
      asset.created_by,
      created_user.username as created_by_username,
      created_user.avatar_url as created_by_avatar_url,
      asset.updated_by,
      updated_user.username as updated_by_username,
      updated_user.avatar_url as updated_by_avatar_url,
      asset.deleted_by,
      deleted_user.username as deleted_by_username,
      deleted_user.avatar_url as deleted_by_avatar_url,
      asset.created_at,
      asset.updated_at,
      asset.deleted_at
    from public.fansub_supporter_assets as asset
    join base_fansubs as base
      on base.id = asset.fansub_id
    left join public.fansub_supporter_asset_revisions as current_revision
      on current_revision.id = asset.current_revision_id
    left join public.users as current_revision_user
      on current_revision_user.id = current_revision.created_by
    left join public.users as created_user
      on created_user.id = asset.created_by
    left join public.users as updated_user
      on updated_user.id = asset.updated_by
    left join public.users as deleted_user
      on deleted_user.id = asset.deleted_by
  ),
  live_ranked_assets as (
    select
      asset.asset_id,
      row_number() over (
        partition by asset.fansub_id, asset.asset_kind
        order by asset.sort_order asc, asset.created_at asc, asset.asset_id asc
      )::integer as quota_rank
    from base_assets as asset
    where not asset.is_archived
  )
  select
    asset.asset_id,
    asset.fansub_id,
    asset.fansub_name,
    asset.fansub_slug,
    asset.tier_level,
    asset.asset_kind,
    asset.shortcode,
    asset.label,
    asset.asset_ref,
    asset.mime_type,
    asset.width,
    asset.height,
    asset.size_bytes,
    asset.is_active,
    asset.is_archived,
    asset.sort_order,
    asset.quota_limit,
    live_ranked.quota_rank,
    coalesce(live_ranked.quota_rank <= asset.quota_limit, false) as is_within_quota,
    (
      not asset.is_archived
      and asset.is_active
      and asset.quota_limit > 0
      and coalesce(live_ranked.quota_rank <= asset.quota_limit, false)
    ) as is_usable,
    asset.presentation,
    asset.current_revision_id,
    asset.current_revision_number,
    asset.latest_revision_number,
    asset.current_revision_created_at,
    asset.current_revision_created_by,
    asset.current_revision_created_by_username,
    asset.current_revision_created_by_avatar_url,
    asset.created_by,
    asset.created_by_username,
    asset.created_by_avatar_url,
    asset.updated_by,
    asset.updated_by_username,
    asset.updated_by_avatar_url,
    asset.deleted_by,
    asset.deleted_by_username,
    asset.deleted_by_avatar_url,
    asset.created_at,
    asset.updated_at,
    asset.deleted_at
  from base_assets as asset
  left join live_ranked_assets as live_ranked
    on live_ranked.asset_id = asset.asset_id
  order by
    asset.updated_at desc,
    asset.created_at desc,
    asset.asset_id desc;
$$;

revoke all on function public.list_admin_supporter_asset_inventory(uuid) from public, anon, authenticated;

create or replace function public.list_admin_supporter_asset_activity(
  p_fansub_id uuid default null
)
returns table (
  event_type text,
  event_label text,
  asset_id uuid,
  fansub_id uuid,
  fansub_name text,
  fansub_slug text,
  asset_kind text,
  shortcode text,
  label text,
  actor_user_id uuid,
  actor_username text,
  actor_avatar_url text,
  occurred_at timestamptz,
  revision_number integer
)
language sql
security definer
stable
set search_path = public
as $$
  with base_fansubs as (
    select
      f.id,
      f.name,
      f.slug
    from public.fansubs as f
    where public.is_admin()
      and (p_fansub_id is null or f.id = p_fansub_id)
  ),
  revision_events as (
    select
      case
        when revision.revision_number = 1 then 'upload'
        else 'edit'
      end as event_type,
      case
        when revision.revision_number = 1 then 'Yukleme'
        else 'Duzenleme'
      end as event_label,
      asset.id as asset_id,
      asset.fansub_id,
      base.name as fansub_name,
      base.slug as fansub_slug,
      asset.asset_kind,
      revision.shortcode,
      revision.label,
      revision.created_by as actor_user_id,
      actor.username as actor_username,
      actor.avatar_url as actor_avatar_url,
      revision.created_at as occurred_at,
      revision.revision_number
    from public.fansub_supporter_asset_revisions as revision
    join public.fansub_supporter_assets as asset
      on asset.id = revision.asset_id
    join base_fansubs as base
      on base.id = asset.fansub_id
    left join public.users as actor
      on actor.id = revision.created_by
  ),
  archive_events as (
    select
      'archive'::text as event_type,
      'Arsivleme'::text as event_label,
      inventory.asset_id,
      inventory.fansub_id,
      inventory.fansub_name,
      inventory.fansub_slug,
      inventory.asset_kind,
      inventory.shortcode,
      inventory.label,
      inventory.deleted_by as actor_user_id,
      inventory.deleted_by_username as actor_username,
      inventory.deleted_by_avatar_url as actor_avatar_url,
      inventory.deleted_at as occurred_at,
      null::integer as revision_number
    from public.list_admin_supporter_asset_inventory(p_fansub_id) as inventory
    where inventory.is_archived
      and inventory.deleted_at is not null
  )
  select *
  from (
    select * from revision_events
    union all
    select * from archive_events
  ) as events
  where events.occurred_at is not null
  order by events.occurred_at desc, events.asset_id desc;
$$;

revoke all on function public.list_admin_supporter_asset_activity(uuid) from public, anon, authenticated;

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
        'lastActor', row_data.last_actor
      )
      order by row_data.live_asset_count desc, row_data.usable_asset_count desc, row_data.fansub_name asc
    ) as rows
    from (
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
        max(greatest(inventory_row.updated_at, inventory_row.created_at)) as last_asset_at,
        max(activity_row.occurred_at) as last_activity_at,
        case
          when max(recent_fansub_activity.actor_user_id) is null then null
          else jsonb_build_object(
            'userId', max(recent_fansub_activity.actor_user_id),
            'username', max(recent_fansub_activity.actor_username),
            'avatarUrl', max(recent_fansub_activity.actor_avatar_url)
          )
        end as last_actor
      from inventory as inventory_row
      left join activity as activity_row
        on activity_row.fansub_id = inventory_row.fansub_id
      left join recent_fansub_activity
        on recent_fansub_activity.fansub_id = inventory_row.fansub_id
      group by
        inventory_row.fansub_id,
        inventory_row.fansub_name,
        inventory_row.fansub_slug
      order by live_asset_count desc, usable_asset_count desc, inventory_row.fansub_name asc
      limit 12
    ) as row_data
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

create or replace function public.get_admin_supporter_asset_fansub_inventory(
  p_fansub_id uuid
)
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

  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  with inventory as (
    select *
    from public.list_admin_supporter_asset_inventory(p_fansub_id)
  ),
  activity as (
    select *
    from public.list_admin_supporter_asset_activity(p_fansub_id)
  ),
  latest_activity as (
    select
      activity_row.actor_user_id,
      activity_row.actor_username,
      activity_row.actor_avatar_url,
      activity_row.occurred_at
    from activity as activity_row
    order by activity_row.occurred_at desc, activity_row.asset_id desc
    limit 1
  ),
  fansub_summary as (
    select
      inventory_row.fansub_id,
      max(inventory_row.fansub_name) as fansub_name,
      max(inventory_row.fansub_slug) as fansub_slug,
      max(inventory_row.tier_level)::integer as tier_level,
      max(case when inventory_row.asset_kind = 'emoji' then inventory_row.quota_limit else 0 end)::integer as emoji_limit,
      max(case when inventory_row.asset_kind = 'sticker' then inventory_row.quota_limit else 0 end)::integer as sticker_limit,
      count(*)::integer as total_asset_count,
      count(*) filter (where not inventory_row.is_archived)::integer as live_asset_count,
      count(*) filter (where inventory_row.is_archived)::integer as archived_asset_count,
      count(*) filter (where inventory_row.is_usable)::integer as usable_asset_count,
      max(greatest(inventory_row.updated_at, inventory_row.created_at)) as last_asset_at
    from inventory as inventory_row
    group by inventory_row.fansub_id
  ),
  items_payload as (
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
      order by
        case row_data.asset_kind when 'emoji' then 0 else 1 end asc,
        row_data.is_archived asc,
        row_data.sort_order asc,
        row_data.created_at asc,
        row_data.asset_id asc
    ) as rows
    from inventory as row_data
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
      limit 16
    ) as row_data
  )
  select jsonb_build_object(
    'fansub', jsonb_build_object(
      'fansubId', summary.fansub_id,
      'name', summary.fansub_name,
      'slug', summary.fansub_slug,
      'tierLevel', summary.tier_level,
      'emojiLimit', summary.emoji_limit,
      'stickerLimit', summary.sticker_limit,
      'totalAssetCount', summary.total_asset_count,
      'liveAssetCount', summary.live_asset_count,
      'archivedAssetCount', summary.archived_asset_count,
      'usableAssetCount', summary.usable_asset_count,
      'lastAssetAt', summary.last_asset_at,
      'lastActivityAt', latest_activity.occurred_at,
      'latestActor', case
        when latest_activity.actor_user_id is null then null
        else jsonb_build_object(
          'userId', latest_activity.actor_user_id,
          'username', latest_activity.actor_username,
          'avatarUrl', latest_activity.actor_avatar_url
        )
      end
    ),
    'items', coalesce((select rows from items_payload), '[]'::jsonb),
    'recentActivity', coalesce((select rows from recent_activity_payload), '[]'::jsonb)
  )
  into v_payload
  from fansub_summary as summary
  left join latest_activity on true;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

grant execute on function public.get_admin_supporter_asset_fansub_inventory(uuid) to authenticated;

create or replace function public.get_admin_supporter_asset_detail(
  p_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
  v_fansub_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Bu islem icin admin yetkisi gerekir.';
  end if;

  if p_asset_id is null then
    raise exception 'Asset kimligi zorunludur.';
  end if;

  select asset.fansub_id
  into v_fansub_id
  from public.fansub_supporter_assets as asset
  where asset.id = p_asset_id;

  if v_fansub_id is null then
    raise exception 'Supporter asset bulunamadi.';
  end if;

  with asset_row as (
    select *
    from public.list_admin_supporter_asset_inventory(v_fansub_id) as inventory
    where inventory.asset_id = p_asset_id
    limit 1
  ),
  revisions_payload as (
    select jsonb_agg(
      jsonb_build_object(
        'revisionId', revision.id,
        'revisionNumber', revision.revision_number,
        'assetKind', asset_row.asset_kind,
        'shortcode', revision.shortcode,
        'label', revision.label,
        'assetRef', revision.asset_ref,
        'mimeType', revision.mime_type,
        'width', revision.width,
        'height', revision.height,
        'sizeBytes', revision.size_bytes,
        'presentation', coalesce(revision.presentation, '{}'::jsonb),
        'createdAt', revision.created_at,
        'createdBy', case
          when revision.created_by is null then null
          else jsonb_build_object(
            'userId', revision.created_by,
            'username', actor.username,
            'avatarUrl', actor.avatar_url
          )
        end,
        'isCurrent', revision.id = asset_row.current_revision_id,
        'isLegacy', revision.revision_number = 1
      )
      order by revision.revision_number desc, revision.created_at desc, revision.id desc
    ) as rows
    from asset_row
    join public.fansub_supporter_asset_revisions as revision
      on revision.asset_id = asset_row.asset_id
    left join public.users as actor
      on actor.id = revision.created_by
  )
  select jsonb_build_object(
    'asset', (
      select jsonb_build_object(
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
      from asset_row as row_data
    ),
    'revisions', coalesce((select rows from revisions_payload), '[]'::jsonb)
  )
  into v_payload;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

grant execute on function public.get_admin_supporter_asset_detail(uuid) to authenticated;

commit;
