alter table public.store_profile_effect_assets
  add column if not exists card_loop_asset_url text;

alter table public.store_profile_effect_assets
  add column if not exists profile_asset_url text;

alter table public.store_profile_effect_assets
  add column if not exists hover_asset_url text;

update public.store_profile_effect_assets
set
  card_loop_asset_url = coalesce(card_loop_asset_url, hover_loop_asset_url, profile_loop_asset_url),
  profile_asset_url = coalesce(profile_asset_url, poster_asset_url),
  hover_asset_url = coalesce(hover_asset_url, profile_asset_url, poster_asset_url)
where
  card_loop_asset_url is null
  or profile_asset_url is null
  or hover_asset_url is null;

alter table public.store_profile_effect_assets
  alter column card_loop_asset_url set not null;

alter table public.store_profile_effect_assets
  alter column profile_asset_url set not null;

alter table public.store_profile_effect_assets
  alter column hover_asset_url set not null;

alter table public.store_profile_effect_assets
  alter column profile_intro_asset_url drop not null;

alter table public.store_profile_effect_assets
  alter column hover_intro_asset_url drop not null;
