alter table public.store_items
  add column if not exists poster_asset_url text;

comment on column public.store_items.poster_asset_url is
  'Frame ve background urunlerinde kart idle gorunumu icin kullanilan statik poster asset yolu.';
