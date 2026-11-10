-- ============================================
-- MangaZone | Storage Buckets + Policies (V2)
-- Date: 2026-02-07
-- ============================================

-- Bucket tanimlari
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('manga-covers', 'manga-covers', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('chapter-pages', 'chapter-pages', true, 15728640, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Old policy cleanup
drop policy if exists "Public read manga covers" on storage.objects;
drop policy if exists "Authenticated upload manga covers" on storage.objects;
drop policy if exists "Owner update manga covers" on storage.objects;
drop policy if exists "Owner delete manga covers" on storage.objects;

drop policy if exists "Public read chapter pages" on storage.objects;
drop policy if exists "Authenticated upload chapter pages" on storage.objects;
drop policy if exists "Owner update chapter pages" on storage.objects;
drop policy if exists "Owner delete chapter pages" on storage.objects;

drop policy if exists "Public read avatars" on storage.objects;
drop policy if exists "Authenticated upload avatars" on storage.objects;
drop policy if exists "Owner update avatars" on storage.objects;
drop policy if exists "Owner delete avatars" on storage.objects;

-- manga-covers
create policy "Public read manga covers"
  on storage.objects
  for select
  using (bucket_id = 'manga-covers');

create policy "Authenticated upload manga covers"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'manga-covers');

create policy "Owner update manga covers"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'manga-covers' and owner = auth.uid())
  with check (bucket_id = 'manga-covers' and owner = auth.uid());

create policy "Owner delete manga covers"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'manga-covers' and owner = auth.uid());

-- chapter-pages
create policy "Public read chapter pages"
  on storage.objects
  for select
  using (bucket_id = 'chapter-pages');

create policy "Authenticated upload chapter pages"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'chapter-pages');

create policy "Owner update chapter pages"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'chapter-pages' and owner = auth.uid())
  with check (bucket_id = 'chapter-pages' and owner = auth.uid());

create policy "Owner delete chapter pages"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'chapter-pages' and owner = auth.uid());

-- avatars
create policy "Public read avatars"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "Authenticated upload avatars"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'avatars');

create policy "Owner update avatars"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid())
  with check (bucket_id = 'avatars' and owner = auth.uid());

create policy "Owner delete avatars"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());
