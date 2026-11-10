alter table if exists public.storefront_collection_placements
  add column if not exists tab_key text,
  add column if not exists tab_label text,
  add column if not exists tab_sort_order integer not null default 0;

create index if not exists storefront_collection_placements_tab_idx
  on public.storefront_collection_placements (surface_key, campaign_id, placement_type, placement_key, tab_sort_order);

comment on column public.storefront_collection_placements.tab_key is
  'Collection feed placementlari icin sekme anahtari. Null ise koleksiyon temasindan turetilir.';

comment on column public.storefront_collection_placements.tab_label is
  'Collection feed placementlari icin sekme etiketi. Null ise koleksiyon tema etiketinden uretilir.';

comment on column public.storefront_collection_placements.tab_sort_order is
  'Collection feed sekmelerinin gorunum sirasi.';
