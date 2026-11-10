begin;

-- When the store-assets bucket/policy set is missing or stale on the live project
-- the localhost Supabase fallback upload flow falls with 400. This migration
-- restores the existing admin write contract idempotently and re-announces new profile
-- effect columns to the PostgREST schema cache.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-assets',
  'store-assets',
  true,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.store_profile_effect_assets
  add column if not exists modal_backdrop_asset_url text,
  add column if not exists effect_manifest jsonb not null default '{}'::jsonb;

alter table public.store_profile_effect_assets
  drop constraint if exists store_profile_effect_assets_effect_manifest_object_check;

alter table public.store_profile_effect_assets
  add constraint store_profile_effect_assets_effect_manifest_object_check
  check (jsonb_typeof(effect_manifest) = 'object');

drop policy if exists "Admin upload store assets" on storage.objects;
drop policy if exists "Admin update store assets" on storage.objects;
drop policy if exists "Admin delete store assets" on storage.objects;

create policy "Admin upload store assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-assets'
    and public.current_app_role() = 'admin'
  );

create policy "Admin update store assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'store-assets'
    and public.current_app_role() = 'admin'
  )
  with check (
    bucket_id = 'store-assets'
    and public.current_app_role() = 'admin'
  );

create policy "Admin delete store assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'store-assets'
    and public.current_app_role() = 'admin'
  );

notify pgrst, 'reload schema';

commit;
