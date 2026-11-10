-- Data cleanup (user approval 2026-11-04). The old form of each row first goes to backup;
-- data_cleanup_archive is used to roll back.
--
-- Not deleted: bought store_items, home collections tied to campaigns,
-- tasks with progress records (deactivated).

create table public.data_cleanup_archive (
  id bigint generated always as identity primary key,
  batch text not null,
  source_table text not null,
  action text not null check (action in ('delete', 'update')),
  row_data jsonb not null,
  archived_at timestamptz not null default now()
);
alter table public.data_cleanup_archive enable row level security;
revoke all on public.data_cleanup_archive from public, anon, authenticated;

-- 1) Pasif deneme vitrin koleksiyonlari
insert into public.data_cleanup_archive (batch, source_table, action, row_data)
select '20261104-i18n', 'storefront_collection_items', 'delete', to_jsonb(i) from public.storefront_collection_items i
where i.collection_id in ('205756d3-f752-470b-a49c-0c566c3156af', '66b3d2a8-7704-425e-b622-f706c73ba862', '48f4d2ba-03aa-4e64-b968-8d575d2780f8', 'bd4737e8-544a-49f4-8967-5f7e08953631');
insert into public.data_cleanup_archive (batch, source_table, action, row_data)
select '20261104-i18n', 'storefront_collection_placements', 'delete', to_jsonb(p) from public.storefront_collection_placements p
where p.collection_id in ('205756d3-f752-470b-a49c-0c566c3156af', '66b3d2a8-7704-425e-b622-f706c73ba862', '48f4d2ba-03aa-4e64-b968-8d575d2780f8', 'bd4737e8-544a-49f4-8967-5f7e08953631');
insert into public.data_cleanup_archive (batch, source_table, action, row_data)
select '20261104-i18n', 'storefront_collections', 'delete', to_jsonb(c) from public.storefront_collections c
where c.id in ('205756d3-f752-470b-a49c-0c566c3156af', '66b3d2a8-7704-425e-b622-f706c73ba862', '48f4d2ba-03aa-4e64-b968-8d575d2780f8', 'bd4737e8-544a-49f4-8967-5f7e08953631') and not c.is_active;
delete from public.storefront_collections
where id in ('205756d3-f752-470b-a49c-0c566c3156af', '66b3d2a8-7704-425e-b622-f706c73ba862', '48f4d2ba-03aa-4e64-b968-8d575d2780f8', 'bd4737e8-544a-49f4-8967-5f7e08953631') and not is_active;

-- 2) Trial event and task: progress records exist, not deleted, deactivated
insert into public.data_cleanup_archive (batch, source_table, action, row_data)
select '20261104-i18n', 'quests', 'update', to_jsonb(q) from public.quests q where q.id = 'b23706fc-76b4-4991-8dc8-20ed1572753a';
insert into public.data_cleanup_archive (batch, source_table, action, row_data)
select '20261104-i18n', 'quest_events', 'update', to_jsonb(e) from public.quest_events e where e.id = 'f80061aa-5675-47b2-8404-71a89bfa9661';
update public.quests set is_active = false where id = 'b23706fc-76b4-4991-8dc8-20ed1572753a';
update public.quest_events set is_active = false where id = 'f80061aa-5675-47b2-8404-71a89bfa9661';

-- 3) Yayindaki deneme duyurulari ("ne", "baslik"): arsive alinir, yanitlar korunur
insert into public.data_cleanup_archive (batch, source_table, action, row_data)
select '20261104-i18n', 'announcement_internal.entries', 'update', to_jsonb(e) from announcement_internal.entries e
where e.id in ('5c4379a9-98d0-4bab-85c2-5a42b006df9f', '4fa9f3d5-bda4-4b2c-aebd-38e5e997d4ca');
update announcement_internal.entries set status = 'archived'
where id in ('5c4379a9-98d0-4bab-85c2-5a42b006df9f', '4fa9f3d5-bda4-4b2c-aebd-38e5e997d4ca') and status = 'published';

-- 4) Broken characters ("?") in the old showcase: text is repaired, record and ownership stay the same
create temporary table cleanup_store_text (id uuid primary key, new_name text, new_description text) on commit drop;
insert into cleanup_store_text values
  ('f79c148d-dc08-498b-8f31-dd3ac95c10af', 'İnce Işık Efekti', 'Profil yüzeyi için arşivlenmiş ışık efekti.'),
  ('385b36f2-26c3-4515-920a-caef288f369c', 'Bahar Işıltısı Efekti', 'Profil yüzeyi için arşivlenmiş mevsim efekti.'),
  ('7d99293c-371b-4c2f-a72d-959374a05b6d', 'Gece Yankısı Efekti', 'Profil yüzeyi için arşivlenmiş gece efekti.'),
  ('b80b5c53-62f2-498d-979c-0af1dc9c7f23', 'Hareketli Poster Arka Planı', 'Hareketli poster temalı profil arka planı.'),
  ('14714c79-b5b7-4fca-9749-5b2973d7f059', 'Karanlık Güller', 'Premium poster ile açılan ve hover anında canlanan gül ağırlıklı profil efekti.'),
  ('f8718534-311c-47f4-8fe0-a317c85a7ee5', 'Klasik Çerçeve 01', 'Arşivlenmiş özel profil çerçevesi.'),
  ('5a874d50-8518-46aa-bdec-b716b7f04287', 'Klasik Çerçeve 02', 'Arşivlenmiş özel profil çerçevesi.'),
  ('fb457ced-dc86-4357-a18b-12fa9339f2ec', 'Klasik Çerçeve 03', 'Arşivlenmiş özel profil çerçevesi.'),
  ('3ec088b3-be16-4b74-b486-2111175c38c9', 'Klasik Çerçeve 04', 'Arşivlenmiş özel profil çerçevesi.'),
  ('120b72a8-8f6d-4434-8c60-2dafc8433d55', 'Mozaik İzleri Deseni', 'Profil yüzeyleri için arşivlenmiş doku deseni.'),
  ('d12f7b93-529e-4fa8-a81a-4469d84a855d', 'Sessiz Parıltı Efekti', 'Profil yüzeyi için arşivlenmiş parıltı efekti.'),
  ('0ec214c0-f1e2-4de6-a073-6457d71f4c1c', 'Yıldız Geçidi Arka Planı', 'Hareketli uzay temalı profil arka planı.');
insert into public.data_cleanup_archive (batch, source_table, action, row_data)
select '20261104-i18n', 'store_items', 'update', to_jsonb(s)
from public.store_items s join cleanup_store_text t on t.id = s.id
where s.name like '%?%' or s.description like '%?%';
update public.store_items s
set name = t.new_name, description = t.new_description
from cleanup_store_text t
where s.id = t.id and (s.name like '%?%' or s.description like '%?%');
