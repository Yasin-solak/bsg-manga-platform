begin;

create or replace function public.list_store_cosmetic_packages_catalog(
  p_include_inactive boolean default false,
  p_package_key text default null
)
returns table (
  package_key text,
  name text,
  description text,
  price integer,
  original_price integer,
  currency text,
  frame_store_item_id uuid,
  profile_effect_store_item_id uuid,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  frame_item_id uuid,
  frame_item_name text,
  frame_item_description text,
  frame_item_identifier text,
  frame_item_type text,
  frame_item_price integer,
  frame_item_original_price integer,
  frame_item_currency text,
  frame_item_image_key text,
  frame_item_custom_asset_url text,
  frame_item_poster_asset_url text,
  frame_item_theme_name text,
  frame_item_is_active boolean,
  frame_item_created_at timestamptz,
  frame_item_purchase_count integer,
  profile_effect_item_id uuid,
  profile_effect_item_name text,
  profile_effect_item_description text,
  profile_effect_item_identifier text,
  profile_effect_item_type text,
  profile_effect_item_price integer,
  profile_effect_item_original_price integer,
  profile_effect_item_currency text,
  profile_effect_item_image_key text,
  profile_effect_item_custom_asset_url text,
  profile_effect_item_poster_asset_url text,
  profile_effect_item_theme_name text,
  profile_effect_item_is_active boolean,
  profile_effect_item_created_at timestamptz,
  profile_effect_item_purchase_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package_key text := nullif(trim(coalesce(p_package_key, '')), '');
  v_allow_admin_visibility boolean := coalesce(p_include_inactive, false) and coalesce(public.is_admin(), false);
begin
  return query
  select
    scp.package_key,
    scp.name,
    scp.description,
    scp.price,
    scp.original_price,
    scp.currency,
    scp.frame_store_item_id,
    scp.profile_effect_store_item_id,
    scp.is_active,
    scp.created_at,
    scp.updated_at,
    frame_item.id as frame_item_id,
    frame_item.name as frame_item_name,
    frame_item.description as frame_item_description,
    frame_item.identifier as frame_item_identifier,
    frame_item.type::text as frame_item_type,
    frame_item.price as frame_item_price,
    frame_item.original_price as frame_item_original_price,
    frame_item.currency::text as frame_item_currency,
    frame_item.image_key as frame_item_image_key,
    frame_item.custom_asset_url as frame_item_custom_asset_url,
    frame_item.poster_asset_url as frame_item_poster_asset_url,
    frame_item.theme_name as frame_item_theme_name,
    frame_item.is_active as frame_item_is_active,
    frame_item.created_at as frame_item_created_at,
    frame_item.purchase_count as frame_item_purchase_count,
    effect_item.id as profile_effect_item_id,
    effect_item.name as profile_effect_item_name,
    effect_item.description as profile_effect_item_description,
    effect_item.identifier as profile_effect_item_identifier,
    effect_item.type::text as profile_effect_item_type,
    effect_item.price as profile_effect_item_price,
    effect_item.original_price as profile_effect_item_original_price,
    effect_item.currency::text as profile_effect_item_currency,
    effect_item.image_key as profile_effect_item_image_key,
    effect_item.custom_asset_url as profile_effect_item_custom_asset_url,
    effect_item.poster_asset_url as profile_effect_item_poster_asset_url,
    effect_item.theme_name as profile_effect_item_theme_name,
    effect_item.is_active as profile_effect_item_is_active,
    effect_item.created_at as profile_effect_item_created_at,
    effect_item.purchase_count as profile_effect_item_purchase_count
  from public.store_cosmetic_packages scp
  join public.store_items frame_item on frame_item.id = scp.frame_store_item_id
  join public.store_items effect_item on effect_item.id = scp.profile_effect_store_item_id
  where (v_package_key is null or scp.package_key = v_package_key)
    and (
      v_allow_admin_visibility
      or (
        scp.is_active = true
        and frame_item.is_active = true
        and effect_item.is_active = true
      )
    )
  order by scp.created_at desc;
end;
$$;

revoke all on function public.list_store_cosmetic_packages_catalog(boolean, text) from public;
grant execute on function public.list_store_cosmetic_packages_catalog(boolean, text) to anon;
grant execute on function public.list_store_cosmetic_packages_catalog(boolean, text) to authenticated;

commit;
