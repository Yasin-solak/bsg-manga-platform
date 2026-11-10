begin;

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;

create or replace function app_private.is_uuid_text(p_value text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return false;
  end if;

  perform p_value::uuid;
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.is_valid_storefront_asset_ref(p_value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    p_value is not null
    and btrim(p_value) <> ''
    and char_length(btrim(p_value)) <= 2048
    and btrim(p_value) !~* '^(javascript|vbscript|data):'
    and (
      btrim(p_value) like '/%'
      or btrim(p_value) ~* '^https://'
      or btrim(p_value) ~* '^store-assets://[a-z0-9][a-z0-9/_.-]*$'
      or btrim(p_value) ~* '^[a-z0-9][a-z0-9/_.-]*$'
    );
$$;

create or replace function app_private.is_valid_storefront_link_target(p_target jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, app_private
as $$
declare
  v_kind text := p_target->>'kind';
  v_path text := p_target->>'path';
  v_url text := p_target->>'url';
begin
  if jsonb_typeof(p_target) <> 'object' then
    return false;
  end if;

  if v_kind = 'collection' then
    return app_private.is_uuid_text(p_target->>'collectionId');
  end if;

  if v_kind = 'internal_path' then
    return v_path is not null
      and v_path like '/%'
      and v_path not like '//%'
      and char_length(v_path) <= 500;
  end if;

  if v_kind = 'external_url' then
    return v_url is not null
      and v_url ~* '^https://'
      and char_length(v_url) <= 2048;
  end if;

  return false;
end;
$$;

create or replace function app_private.is_valid_storefront_merchandise_ref(
  p_ref jsonb,
  p_expected_type text default null
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, app_private
as $$
declare
  v_kind text := p_ref->>'kind';
  v_item_type text := p_ref->>'itemType';
  v_package_key text := p_ref->>'packageKey';
begin
  if jsonb_typeof(p_ref) <> 'object' then
    return false;
  end if;

  if v_kind = 'store_item' then
    if v_item_type not in ('frame', 'profile_effect') then
      return false;
    end if;

    if p_expected_type in ('frame', 'profile_effect') and v_item_type <> p_expected_type then
      return false;
    end if;

    if p_expected_type = 'package' then
      return false;
    end if;

    return app_private.is_uuid_text(p_ref->>'itemId');
  end if;

  if v_kind = 'package' then
    if p_expected_type in ('frame', 'profile_effect') then
      return false;
    end if;

    return v_package_key is not null
      and v_package_key ~ '^[a-z0-9][a-z0-9_-]{1,99}$';
  end if;

  return false;
end;
$$;

create or replace function app_private.is_valid_storefront_hero_transform(p_transform jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_x numeric;
  v_y numeric;
  v_width numeric;
  v_rotation numeric := 0;
  v_opacity numeric := 1;
begin
  if jsonb_typeof(p_transform) <> 'object' then
    return false;
  end if;

  v_x := (p_transform->>'xPercent')::numeric;
  v_y := (p_transform->>'yPercent')::numeric;
  v_width := (p_transform->>'widthPercent')::numeric;

  if p_transform ? 'rotationDeg' then
    v_rotation := (p_transform->>'rotationDeg')::numeric;
  end if;

  if p_transform ? 'opacity' then
    v_opacity := (p_transform->>'opacity')::numeric;
  end if;

  return v_x between 0 and 100
    and v_y between 0 and 100
    and v_width between 1 and 100
    and v_rotation between -180 and 180
    and v_opacity between 0 and 1;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.is_valid_storefront_collection_items(p_items jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, app_private
as $$
declare
  v_item jsonb;
  v_id text;
  v_sort_order integer;
  v_merchandise_key text;
  v_seen_ids text[] := array[]::text[];
  v_seen_sort_orders integer[] := array[]::integer[];
  v_seen_merchandise text[] := array[]::text[];
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      return false;
    end if;

    v_id := v_item->>'id';
    if not app_private.is_uuid_text(v_id) or v_id = any(v_seen_ids) then
      return false;
    end if;
    v_seen_ids := array_append(v_seen_ids, v_id);

    v_sort_order := (v_item->>'sortOrder')::integer;
    if v_sort_order < 0 or v_sort_order > 10000 or v_sort_order = any(v_seen_sort_orders) then
      return false;
    end if;
    v_seen_sort_orders := array_append(v_seen_sort_orders, v_sort_order);

    if not app_private.is_valid_storefront_merchandise_ref(v_item->'merchandise') then
      return false;
    end if;

    v_merchandise_key := case
      when v_item->'merchandise'->>'kind' = 'package'
        then 'package:' || (v_item->'merchandise'->>'packageKey')
      else 'store_item:' || (v_item->'merchandise'->>'itemType') || ':' || (v_item->'merchandise'->>'itemId')
    end;

    if v_merchandise_key = any(v_seen_merchandise) then
      return false;
    end if;
    v_seen_merchandise := array_append(v_seen_merchandise, v_merchandise_key);
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.is_valid_storefront_hero_layers(p_layers jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, app_private
as $$
declare
  v_layer jsonb;
  v_layer_type text;
  v_interaction text;
  v_id text;
  v_sort_order integer;
  v_z_index integer;
  v_seen_ids text[] := array[]::text[];
  v_seen_sort_orders integer[] := array[]::integer[];
begin
  if jsonb_typeof(p_layers) <> 'array' or jsonb_array_length(p_layers) > 30 then
    return false;
  end if;

  for v_layer in select value from jsonb_array_elements(p_layers)
  loop
    v_layer_type := v_layer->>'layerType';
    v_interaction := v_layer->>'interactionMode';
    v_id := v_layer->>'id';

    if jsonb_typeof(v_layer) <> 'object' or not app_private.is_uuid_text(v_id) or v_id = any(v_seen_ids) then
      return false;
    end if;
    v_seen_ids := array_append(v_seen_ids, v_id);

    v_sort_order := (v_layer->>'sortOrder')::integer;
    if v_sort_order < 0 or v_sort_order > 10000 or v_sort_order = any(v_seen_sort_orders) then
      return false;
    end if;
    v_seen_sort_orders := array_append(v_seen_sort_orders, v_sort_order);

    v_z_index := (v_layer->>'zIndex')::integer;
    if v_z_index < -100 or v_z_index > 1000 then
      return false;
    end if;

    if not app_private.is_valid_storefront_hero_transform(v_layer->'desktopTransform') then
      return false;
    end if;

    if v_layer ? 'tabletTransform' and not app_private.is_valid_storefront_hero_transform(v_layer->'tabletTransform') then
      return false;
    end if;

    if v_layer ? 'mobileTransform' and not app_private.is_valid_storefront_hero_transform(v_layer->'mobileTransform') then
      return false;
    end if;

    if v_layer_type in ('background_asset', 'brand_logo', 'decorative_asset') then
      if v_interaction <> 'none' or not app_private.is_valid_storefront_asset_ref(v_layer->>'assetUrl') then
        return false;
      end if;
    elsif v_layer_type = 'copy_block' then
      if v_interaction <> 'none' or btrim(coalesce(v_layer->>'title', '')) = '' then
        return false;
      end if;
    elsif v_layer_type = 'cta' then
      if v_interaction not in ('collection_link', 'cta_link')
        or btrim(coalesce(v_layer->>'label', '')) = ''
        or not app_private.is_valid_storefront_link_target(v_layer->'target') then
        return false;
      end if;
    elsif v_layer_type = 'frame_card' then
      if v_interaction <> 'commerce_card'
        or not app_private.is_valid_storefront_merchandise_ref(v_layer->'merchandise', 'frame') then
        return false;
      end if;
    elsif v_layer_type = 'profile_effect_card' then
      if v_interaction <> 'commerce_card'
        or not app_private.is_valid_storefront_merchandise_ref(v_layer->'merchandise', 'profile_effect') then
        return false;
      end if;
    elsif v_layer_type = 'package_card' then
      if v_interaction <> 'commerce_card'
        or not app_private.is_valid_storefront_merchandise_ref(v_layer->'merchandise', 'package') then
        return false;
      end if;
    elsif v_layer_type = 'linked_art_asset' then
      if v_interaction not in ('none', 'commerce_card', 'collection_link', 'cta_link')
        or not app_private.is_valid_storefront_asset_ref(v_layer->>'assetUrl') then
        return false;
      end if;

      if v_interaction = 'commerce_card'
        and not app_private.is_valid_storefront_merchandise_ref(v_layer->'merchandise') then
        return false;
      end if;

      if v_interaction in ('collection_link', 'cta_link')
        and not app_private.is_valid_storefront_link_target(v_layer->'target') then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.is_valid_storefront_homepage_document(p_document jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, app_private
as $$
declare
  v_section jsonb;
  v_type text;
  v_id text;
  v_sort_order integer;
  v_seen_ids text[] := array[]::text[];
  v_seen_sort_orders integer[] := array[]::integer[];
begin
  if jsonb_typeof(p_document) <> 'object'
    or jsonb_typeof(p_document->'sections') <> 'array'
    or jsonb_array_length(p_document->'sections') > 40 then
    return false;
  end if;

  for v_section in select value from jsonb_array_elements(p_document->'sections')
  loop
    v_type := v_section->>'type';
    v_id := v_section->>'id';

    if jsonb_typeof(v_section) <> 'object' or not app_private.is_uuid_text(v_id) or v_id = any(v_seen_ids) then
      return false;
    end if;
    v_seen_ids := array_append(v_seen_ids, v_id);

    v_sort_order := (v_section->>'sortOrder')::integer;
    if v_sort_order < 0 or v_sort_order > 10000 or v_sort_order = any(v_seen_sort_orders) then
      return false;
    end if;
    v_seen_sort_orders := array_append(v_seen_sort_orders, v_sort_order);

    if v_type in ('campaign_hero', 'campaign_banner_band') then
      if not app_private.is_uuid_text(v_section->>'campaignId') then
        return false;
      end if;

      if v_type = 'campaign_banner_band'
        and v_section ? 'target'
        and not app_private.is_valid_storefront_link_target(v_section->'target') then
        return false;
      end if;
    elsif v_type = 'product_rail' then
      if not app_private.is_uuid_text(v_section->>'collectionId')
        or btrim(coalesce(v_section->>'title', '')) = ''
        or coalesce(v_section->>'presentation', 'top_banner') not in ('plain', 'top_banner', 'left_promo_panel') then
        return false;
      end if;

      if v_section ? 'campaignId'
        and v_section->>'campaignId' is not null
        and not app_private.is_uuid_text(v_section->>'campaignId') then
        return false;
      end if;

      if coalesce((v_section->>'desktopVisibleLimit')::integer, 5) not in (4, 5) then
        return false;
      end if;
    elsif v_type = 'premium_spotlight' then
      if v_section ? 'title' and btrim(coalesce(v_section->>'title', '')) = '' then
        return false;
      end if;
    elsif v_type = 'spacer_divider' then
      if coalesce(v_section->>'size', 'md') not in ('none', 'sm', 'md', 'lg', 'xl') then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create table if not exists public.storefront_home_collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,99}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  desktop_banner_asset_url text,
  mobile_banner_asset_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  items jsonb not null default '[]'::jsonb check (app_private.is_valid_storefront_collection_items(items)),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (desktop_banner_asset_url is null or app_private.is_valid_storefront_asset_ref(desktop_banner_asset_url)),
  check (mobile_banner_asset_url is null or app_private.is_valid_storefront_asset_ref(mobile_banner_asset_url)),
  check (ends_at is null or starts_at is null or starts_at < ends_at)
);

create table if not exists public.storefront_home_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,99}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'archived')),
  collection_id uuid not null references public.storefront_home_collections(id) on delete restrict,
  desktop_banner_asset_url text not null check (app_private.is_valid_storefront_asset_ref(desktop_banner_asset_url)),
  mobile_banner_asset_url text,
  logo_asset_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  hero_layers jsonb not null default '[]'::jsonb check (app_private.is_valid_storefront_hero_layers(hero_layers)),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mobile_banner_asset_url is null or app_private.is_valid_storefront_asset_ref(mobile_banner_asset_url)),
  check (logo_asset_url is null or app_private.is_valid_storefront_asset_ref(logo_asset_url)),
  check (ends_at is null or starts_at is null or starts_at < ends_at)
);

create table if not exists public.storefront_homepage_drafts (
  id uuid primary key default gen_random_uuid(),
  draft_key text not null unique default 'default' check (draft_key = 'default'),
  schema_version integer not null default 1 check (schema_version = 1),
  document jsonb not null default '{"sections":[]}'::jsonb check (app_private.is_valid_storefront_homepage_document(document)),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storefront_homepage_snapshots (
  id uuid primary key default gen_random_uuid(),
  schema_version integer not null default 1 check (schema_version = 1),
  document jsonb not null check (app_private.is_valid_storefront_homepage_document(document)),
  collections_payload jsonb not null default '[]'::jsonb check (jsonb_typeof(collections_payload) = 'array'),
  campaigns_payload jsonb not null default '[]'::jsonb check (jsonb_typeof(campaigns_payload) = 'array'),
  is_active boolean not null default false,
  note text,
  published_by uuid references public.users(id) on delete set null,
  published_at timestamptz not null default now(),
  archived_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists storefront_home_collections_status_idx
  on public.storefront_home_collections (status, updated_at desc);
create index if not exists storefront_home_campaigns_status_idx
  on public.storefront_home_campaigns (status, updated_at desc);
create index if not exists storefront_home_campaigns_collection_id_idx
  on public.storefront_home_campaigns (collection_id);
create index if not exists storefront_homepage_snapshots_published_at_idx
  on public.storefront_homepage_snapshots (published_at desc);
create unique index if not exists storefront_homepage_snapshots_one_active_idx
  on public.storefront_homepage_snapshots (is_active)
  where is_active = true;

drop trigger if exists trg_storefront_home_collections_updated_at on public.storefront_home_collections;
create trigger trg_storefront_home_collections_updated_at
  before update on public.storefront_home_collections
  for each row execute function public.set_updated_at();

drop trigger if exists trg_storefront_home_campaigns_updated_at on public.storefront_home_campaigns;
create trigger trg_storefront_home_campaigns_updated_at
  before update on public.storefront_home_campaigns
  for each row execute function public.set_updated_at();

drop trigger if exists trg_storefront_homepage_drafts_updated_at on public.storefront_homepage_drafts;
create trigger trg_storefront_homepage_drafts_updated_at
  before update on public.storefront_homepage_drafts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_storefront_homepage_snapshots_updated_at on public.storefront_homepage_snapshots;
create trigger trg_storefront_homepage_snapshots_updated_at
  before update on public.storefront_homepage_snapshots
  for each row execute function public.set_updated_at();

alter table public.storefront_home_collections enable row level security;
alter table public.storefront_home_campaigns enable row level security;
alter table public.storefront_homepage_drafts enable row level security;
alter table public.storefront_homepage_snapshots enable row level security;

revoke all on table public.storefront_home_collections from anon, authenticated;
revoke all on table public.storefront_home_campaigns from anon, authenticated;
revoke all on table public.storefront_homepage_drafts from anon, authenticated;
revoke all on table public.storefront_homepage_snapshots from anon, authenticated;

grant select, insert, update, delete on table public.storefront_home_collections to service_role;
grant select, insert, update, delete on table public.storefront_home_campaigns to service_role;
grant select, insert, update, delete on table public.storefront_homepage_drafts to service_role;
grant select, insert, update, delete on table public.storefront_homepage_snapshots to service_role;

notify pgrst, 'reload schema';

commit;
