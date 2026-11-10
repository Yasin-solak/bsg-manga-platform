alter table public.store_profile_effect_assets
  add column if not exists modal_backdrop_asset_url text,
  add column if not exists effect_manifest jsonb not null default '{}'::jsonb;

alter table public.store_profile_effect_assets
  drop constraint if exists store_profile_effect_assets_effect_manifest_object_check;

alter table public.store_profile_effect_assets
  add constraint store_profile_effect_assets_effect_manifest_object_check
  check (jsonb_typeof(effect_manifest) = 'object');

comment on column public.store_profile_effect_assets.modal_backdrop_asset_url
  is 'Profil efekti satin alma/hediye modalinda ortak skeleton sahnesinin arkasinda kullanilan urun arka plani.';

comment on column public.store_profile_effect_assets.effect_manifest
  is 'Ortak skeleton sahnesi uzerinde oynayan katmanli profil efekti sekans manifesti.';
