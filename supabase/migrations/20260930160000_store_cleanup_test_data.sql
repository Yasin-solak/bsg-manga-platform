-- Shop cleanup (before shop v3): test products, test bundles, test collections and
-- campaigns leave sale / showcase. Ownership (users.owned_items, inventory) and
-- order history are untouched: owners keep using the product.

-- 1) Satistaki test urunleri (profil efektleri): satistan kalkar.
update public.store_items
set is_active = false, updated_at = now()
where id in (
  'ddab2b47-b7f3-4ddb-8e21-87121a229a47', -- top (9.999)
  '215d45c4-4edd-4a21-906d-01d8503b3edd', -- top2
  '666bc858-b050-4fcc-b2e0-db95fb400f6a'  -- cin ali (50)
);

-- 2) Test paketleri.
update public.store_cosmetic_packages
set is_active = false, updated_at = now()
where package_key in ('Deneme paket key', 'codex-smoke-storefront-home-package');

-- 3) Test collections and campaigns.
update public.storefront_collections
set is_active = false, updated_at = now()
where slug in ('denemes', 'sdsd', 'xvsdv', 'deneme');

update public.storefront_home_collections
set status = 'archived', updated_at = now()
where slug in ('yeni-koleksiyon', 'yeni-koleksiyon-kopya', 'deneme') and status <> 'archived';

update public.storefront_home_campaigns
set status = 'archived', updated_at = now()
where slug in ('yeni-kampanya', 'yeni-kampanya-kopya', 'yeni-kampanya-kopya-kopya', 'deneme-kampanya', 'deneme-kampanya-kopya')
  and status <> 'archived';

-- 4) The published showcase snapshot is made only of test components (June 8):
-- it leaves publish; the shop home falls to the catalog.
update public.storefront_homepage_snapshots
set is_active = false, archived_at = now(), updated_at = now()
where is_active and id = '264ba3ae-8294-48fd-a850-26d324fdb3e3';

-- 5) Never-used smoke patterns and test badges are deleted (those with no order, gift, inventory,
-- collection or premium bundle reference).
delete from public.store_items s
where (s.name like '[Smoke]%' or s.identifier = 'test-rozet-1-mm5b5kgi')
  and s.purchase_count = 0
  and not exists (select 1 from public.store_order_items o where o.store_item_id = s.id)
  and not exists (select 1 from public.store_item_gifts g where g.store_item_id = s.id)
  and not exists (select 1 from public.store_purchase_requests r where r.item_id = s.id)
  and not exists (select 1 from public.user_inventory_items u where u.store_item_id = s.id)
  and not exists (select 1 from public.fansub_inventory f where f.store_item_id = s.id)
  and not exists (select 1 from public.storefront_collection_items c where c.item_id = s.id)
  and not exists (
    select 1 from public.premium_monthly_packages p
    where s.id in (p.premium_store_item_id, p.frame_store_item_id, p.background_store_item_id, p.pattern_store_item_id)
  );
