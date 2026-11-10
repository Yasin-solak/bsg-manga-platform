alter table public.storefront_collection_placements
  add column if not exists offset_y integer not null default 0;
