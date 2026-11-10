begin;

alter table public.fansub_supporter_assets
  add column if not exists presentation jsonb not null default '{}'::jsonb;

alter table public.fansub_supporter_assets
  drop constraint if exists fansub_supporter_assets_shortcode_check;

alter table public.fansub_supporter_assets
  drop constraint if exists fansub_supporter_assets_label_check;

alter table public.fansub_supporter_assets
  drop constraint if exists fansub_supporter_assets_shortcode_valid;

alter table public.fansub_supporter_assets
  drop constraint if exists fansub_supporter_assets_label_valid;

with normalized_assets as (
  select
    asset.id,
    asset.fansub_id,
    asset.asset_kind,
    asset.created_at,
    asset.label,
    case
      when nullif(
        left(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(coalesce(asset.shortcode, '')), '[^a-z0-9_-]+', '-', 'g'),
              '-{2,}',
              '-',
              'g'
            ),
            '^-+|-+$',
            '',
            'g'
          ),
          16
        ),
        ''
      ) is null then 'asset'
      else left(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(asset.shortcode, '')), '[^a-z0-9_-]+', '-', 'g'),
            '-{2,}',
            '-',
            'g'
          ),
          '^-+|-+$',
          '',
          'g'
        ),
        16
      )
    end as normalized_shortcode
  from public.fansub_supporter_assets as asset
),
ranked_assets as (
  select
    asset.id,
    asset.label,
    asset.normalized_shortcode,
    row_number() over (
      partition by asset.fansub_id, asset.asset_kind, asset.normalized_shortcode
      order by asset.created_at asc, asset.id asc
    ) as duplicate_rank
  from normalized_assets as asset
),
prepared_assets as (
  select
    asset.id,
    case
      when asset.duplicate_rank = 1 then asset.normalized_shortcode
      else left(
        asset.normalized_shortcode,
        greatest(1, 16 - char_length(asset.duplicate_rank::text) - 1)
      ) || '-' || asset.duplicate_rank::text
    end as final_shortcode,
    case
      when char_length(btrim(coalesce(asset.label, ''))) between 1 and 20 then btrim(asset.label)
      when char_length(btrim(coalesce(asset.label, ''))) > 20 then left(btrim(asset.label), 20)
      else 'Yeni ifade'
    end as final_label
  from ranked_assets as asset
)
update public.fansub_supporter_assets as asset
set
  shortcode = case
    when prepared.final_shortcode ~ '^[a-z0-9]' then prepared.final_shortcode
    else 'a' || left(prepared.final_shortcode, 15)
  end,
  label = prepared.final_label
from prepared_assets as prepared
where asset.id = prepared.id
  and (
    asset.shortcode is distinct from case
      when prepared.final_shortcode ~ '^[a-z0-9]' then prepared.final_shortcode
      else 'a' || left(prepared.final_shortcode, 15)
    end
    or asset.label is distinct from prepared.final_label
  );

alter table public.fansub_supporter_assets
  add constraint fansub_supporter_assets_shortcode_valid
  check (
    shortcode = lower(shortcode)
    and shortcode ~ '^[a-z0-9][a-z0-9_-]{1,15}$'
  );

alter table public.fansub_supporter_assets
  add constraint fansub_supporter_assets_label_valid
  check (char_length(btrim(label)) between 1 and 20);

create or replace function public.is_valid_fansub_supporter_asset_presentation(
  p_value jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(coalesce(p_value, '{}'::jsonb)) = 'object'
    and coalesce(jsonb_typeof(coalesce(p_value, '{}'::jsonb) -> 'fitMode'), 'string') = 'string'
    and coalesce(p_value ->> 'fitMode', 'cover') in ('cover', 'contain')
    and coalesce((p_value ->> 'scale')::numeric, 1) between 1 and 2.75
    and coalesce((p_value ->> 'offsetX')::numeric, 0) between -45 and 45
    and coalesce((p_value ->> 'offsetY')::numeric, 0) between -45 and 45
    and coalesce((p_value ->> 'rotation')::integer, 0) in (0, 90, 180, 270);
$$;

alter table public.fansub_supporter_assets
  drop constraint if exists fansub_supporter_assets_presentation_valid;

alter table public.fansub_supporter_assets
  add constraint fansub_supporter_assets_presentation_valid
  check (public.is_valid_fansub_supporter_asset_presentation(presentation));

drop function if exists public.list_public_fansub_supporter_assets(uuid, text);

create function public.list_public_fansub_supporter_assets(
  p_fansub_id uuid,
  p_asset_kind text default null
)
returns table (
  id uuid,
  fansub_id uuid,
  asset_kind text,
  shortcode text,
  label text,
  asset_ref text,
  mime_type text,
  width integer,
  height integer,
  size_bytes integer,
  is_active boolean,
  sort_order integer,
  quota_limit integer,
  quota_rank integer,
  is_within_quota boolean,
  is_usable boolean,
  presentation jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  with snapshot_caps as (
    select coalesce(snapshot.capabilities, public.build_fansub_boost_capabilities(0)) as capabilities
    from public.fansubs as fansub
    left join public.fansub_boost_snapshots as snapshot
      on snapshot.fansub_id = fansub.id
    where fansub.id = p_fansub_id
      and coalesce(fansub.is_active, true) = true
  ),
  ranked_assets as (
    select
      asset.*,
      row_number() over (
        partition by asset.asset_kind
        order by asset.sort_order asc, asset.created_at asc, asset.id asc
      )::integer as quota_rank
    from public.fansub_supporter_assets as asset
    where asset.fansub_id = p_fansub_id
      and (
        nullif(lower(trim(coalesce(p_asset_kind, ''))), '') is null
        or asset.asset_kind = lower(trim(p_asset_kind))
      )
  )
  select
    asset.id,
    asset.fansub_id,
    asset.asset_kind,
    asset.shortcode,
    asset.label,
    asset.asset_ref,
    asset.mime_type,
    asset.width,
    asset.height,
    asset.size_bytes,
    asset.is_active,
    asset.sort_order,
    public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind) as quota_limit,
    asset.quota_rank,
    asset.quota_rank <= public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind) as is_within_quota,
    (
      asset.is_active
      and public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind) > 0
      and asset.quota_rank <= public.resolve_fansub_supporter_asset_limit(snapshot_caps.capabilities, asset.asset_kind)
    ) as is_usable,
    coalesce(asset.presentation, '{}'::jsonb) as presentation,
    asset.created_at,
    asset.updated_at
  from ranked_assets as asset
  cross join snapshot_caps
  order by
    case asset.asset_kind when 'emoji' then 0 else 1 end asc,
    asset.sort_order asc,
    asset.created_at asc,
    asset.id asc;
$$;

drop function if exists public.get_fansub_manage_supporter_assets(uuid);

create function public.get_fansub_manage_supporter_assets(
  p_fansub_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capabilities jsonb := public.build_fansub_boost_capabilities(0);
begin
  if p_fansub_id is null then
    raise exception 'Fansub kimligi zorunludur.';
  end if;

  if not (public.is_admin() or public.is_fansub_staff(p_fansub_id)) then
    raise exception 'Bu fansubun supporter assetlerini gorme yetkiniz yok.';
  end if;

  perform public.maybe_refresh_fansub_boost_snapshot(p_fansub_id);

  select coalesce(snapshot.capabilities, v_capabilities)
  into v_capabilities
  from public.fansub_boost_snapshots as snapshot
  where snapshot.fansub_id = p_fansub_id;

  return jsonb_build_object(
    'fansubId', p_fansub_id,
    'supporterEmojiSlotLimit', public.resolve_fansub_supporter_asset_limit(v_capabilities, 'emoji'),
    'supporterStickerSlotLimit', public.resolve_fansub_supporter_asset_limit(v_capabilities, 'sticker'),
    'items',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', asset_row.id,
            'fansubId', asset_row.fansub_id,
            'assetKind', asset_row.asset_kind,
            'shortcode', asset_row.shortcode,
            'label', asset_row.label,
            'assetRef', asset_row.asset_ref,
            'mimeType', asset_row.mime_type,
            'width', asset_row.width,
            'height', asset_row.height,
            'sizeBytes', asset_row.size_bytes,
            'isActive', asset_row.is_active,
            'sortOrder', asset_row.sort_order,
            'quotaLimit', asset_row.quota_limit,
            'quotaRank', asset_row.quota_rank,
            'isWithinQuota', asset_row.is_within_quota,
            'isUsable', asset_row.is_usable,
            'presentation', asset_row.presentation,
            'createdAt', asset_row.created_at,
            'updatedAt', asset_row.updated_at
          )
          order by
            case asset_row.asset_kind when 'emoji' then 0 else 1 end asc,
            asset_row.sort_order asc,
            asset_row.created_at asc
        )
        from public.list_public_fansub_supporter_assets(p_fansub_id, null) as asset_row
      ), '[]'::jsonb)
  );
end;
$$;

commit;
