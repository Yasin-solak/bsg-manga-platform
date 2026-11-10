alter table public.store_profile_effect_assets
  add column if not exists media_meta jsonb not null default '{}'::jsonb;

update public.store_profile_effect_assets
set media_meta = '{}'::jsonb
where media_meta is null;
