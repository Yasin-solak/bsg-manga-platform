-- ============================================
-- MangaZone | Store Assets Bucket + Policies
-- Date: 2026-02-07
-- ============================================

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

drop policy if exists "Public read store assets" on storage.objects;
drop policy if exists "Admin upload store assets" on storage.objects;
drop policy if exists "Admin update store assets" on storage.objects;
drop policy if exists "Admin delete store assets" on storage.objects;

create policy "Public read store assets"
  on storage.objects
  for select
  using (bucket_id = 'store-assets');

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

