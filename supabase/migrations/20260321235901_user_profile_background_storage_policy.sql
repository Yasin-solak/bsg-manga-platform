-- ============================================
-- MangaZone | User Profile Background Storage Policy
-- Date: 2026-03-21
-- ============================================

drop policy if exists "User upload own profile backgrounds" on storage.objects;
drop policy if exists "User update own profile backgrounds" on storage.objects;
drop policy if exists "User delete own profile backgrounds" on storage.objects;

create policy "User upload own profile backgrounds"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'user-backgrounds'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "User update own profile backgrounds"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'user-backgrounds'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'user-backgrounds'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "User delete own profile backgrounds"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'store-assets'
    and (storage.foldername(name))[1] = 'user-backgrounds'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
