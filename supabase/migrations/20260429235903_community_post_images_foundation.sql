-- Community image post foundation:
-- - Keeps existing Tenor GIF records.
-- - Opens a multi asset model for R2-based static images.
-- - Keeps the old single asset RPC backward compatible.

alter table public.community_post_assets
  add column if not exists position smallint not null default 1,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.community_post_assets
  drop constraint if exists community_post_assets_post_id_key,
  drop constraint if exists community_post_assets_asset_type_check,
  drop constraint if exists community_post_assets_provider_check,
  drop constraint if exists community_post_assets_position_check,
  drop constraint if exists community_post_assets_provider_pair_check,
  add constraint community_post_assets_asset_type_check
    check (asset_type in ('gif', 'image')),
  add constraint community_post_assets_provider_check
    check (provider in ('tenor', 'r2')),
  add constraint community_post_assets_position_check
    check (position between 1 and 4),
  add constraint community_post_assets_provider_pair_check
    check (
      (asset_type = 'gif' and provider = 'tenor')
      or (asset_type = 'image' and provider = 'r2')
    );

create unique index if not exists community_post_assets_post_position_key
  on public.community_post_assets (post_id, position);

create unique index if not exists community_post_assets_one_gif_per_post_key
  on public.community_post_assets (post_id)
  where asset_type = 'gif';

create index if not exists community_post_assets_post_type_position_idx
  on public.community_post_assets (post_id, asset_type, position);

create or replace function public.prevent_mixed_community_post_asset_types()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.asset_type = 'gif' and new.provider <> 'tenor' then
    raise exception 'GIF assetleri yalniz Tenor provider ile kaydedilebilir.';
  end if;

  if new.asset_type = 'image' and new.provider <> 'r2' then
    raise exception 'Gorsel assetleri yalniz R2 provider ile kaydedilebilir.';
  end if;

  if exists (
    select 1
    from public.community_post_assets existing
    where existing.post_id = new.post_id
      and existing.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and existing.asset_type <> new.asset_type
  ) then
    raise exception 'Bir topluluk gonderisinde GIF ve yuklenen gorsel ayni anda kullanilamaz.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_mixed_community_post_asset_types on public.community_post_assets;
create trigger trg_prevent_mixed_community_post_asset_types
before insert or update on public.community_post_assets
for each row execute function public.prevent_mixed_community_post_asset_types();

create or replace function public.get_community_post_assets(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cpa.id,
        'postId', cpa.post_id,
        'assetType', cpa.asset_type,
        'provider', cpa.provider,
        'providerAssetId', cpa.provider_asset_id,
        'originalUrl', cpa.original_url,
        'previewUrl', cpa.preview_url,
        'width', cpa.width,
        'height', cpa.height,
        'altText', cpa.alt_text,
        'position', cpa.position,
        'metadata', cpa.metadata
      )
      order by cpa.position asc, cpa.created_at asc
    ),
    '[]'::jsonb
  )
  from public.community_post_assets cpa
  join public.community_posts cp on cp.id = cpa.post_id
  where cpa.post_id = p_post_id
    and (
      (cp.status = 'approved' and cp.is_active = true)
      or cp.author_id = public.current_public_user_id()
      or public.is_admin()
    );
$$;

create or replace function public.get_community_post_asset(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.get_community_post_assets(p_post_id) -> 0;
$$;

revoke all on function public.get_community_post_assets(uuid) from public;
grant execute on function public.get_community_post_assets(uuid) to anon, authenticated;

revoke all on function public.get_community_post_asset(uuid) from public;
grant execute on function public.get_community_post_asset(uuid) to anon, authenticated;
