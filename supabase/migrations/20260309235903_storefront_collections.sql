create table if not exists public.storefront_collections (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (char_length(trim(name)) between 2 and 120),
  slug text not null
    check (char_length(trim(slug)) between 2 and 140),
  description text not null default ''
    check (char_length(description) <= 600),
  desktop_banner_url text not null default ''
    check (char_length(desktop_banner_url) <= 2000),
  mobile_banner_url text not null default ''
    check (char_length(mobile_banner_url) <= 2000),
  theme_name text null
    check (theme_name is null or char_length(trim(theme_name)) between 2 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists storefront_collections_slug_key
  on public.storefront_collections (lower(slug));

drop trigger if exists trg_storefront_collections_updated_at on public.storefront_collections;
create trigger trg_storefront_collections_updated_at
  before update on public.storefront_collections
  for each row
  execute function public.set_updated_at();

create table if not exists public.storefront_collection_items (
  collection_id uuid not null references public.storefront_collections(id) on delete cascade,
  item_id uuid not null references public.store_items(id) on delete cascade,
  sort_order integer not null default 0
    check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (collection_id, item_id)
);

create index if not exists storefront_collection_items_collection_sort_idx
  on public.storefront_collection_items (collection_id, sort_order, created_at);

create table if not exists public.storefront_collection_placements (
  id uuid primary key default gen_random_uuid(),
  surface_key text not null
    check (surface_key in ('test_store_home', 'live_store_home')),
  campaign_id text not null
    check (char_length(trim(campaign_id)) between 4 and 120),
  view_key text not null
    check (view_key in ('featured', 'browse', 'premium')),
  placement_type text not null
    check (placement_type in ('collection_feed', 'featured_rail', 'product_rail')),
  placement_key text not null
    check (char_length(trim(placement_key)) between 2 and 140),
  collection_id uuid not null references public.storefront_collections(id) on delete cascade,
  sort_order integer not null default 0
    check (sort_order >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists storefront_collection_placements_surface_campaign_idx
  on public.storefront_collection_placements (surface_key, campaign_id, view_key, placement_type, placement_key, sort_order);

drop trigger if exists trg_storefront_collection_placements_updated_at on public.storefront_collection_placements;
create trigger trg_storefront_collection_placements_updated_at
  before update on public.storefront_collection_placements
  for each row
  execute function public.set_updated_at();

alter table public.storefront_collections enable row level security;
alter table public.storefront_collection_items enable row level security;
alter table public.storefront_collection_placements enable row level security;

drop policy if exists storefront_collections_select_public on public.storefront_collections;
create policy storefront_collections_select_public
  on public.storefront_collections
  for select
  using (is_active = true or public.is_admin());

drop policy if exists storefront_collections_admin_write on public.storefront_collections;
create policy storefront_collections_admin_write
  on public.storefront_collections
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists storefront_collection_items_select_public on public.storefront_collection_items;
create policy storefront_collection_items_select_public
  on public.storefront_collection_items
  for select
  using (
    exists (
      select 1
      from public.storefront_collections sc
      where sc.id = storefront_collection_items.collection_id
        and (sc.is_active = true or public.is_admin())
    )
  );

drop policy if exists storefront_collection_items_admin_write on public.storefront_collection_items;
create policy storefront_collection_items_admin_write
  on public.storefront_collection_items
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists storefront_collection_placements_select_public on public.storefront_collection_placements;
create policy storefront_collection_placements_select_public
  on public.storefront_collection_placements
  for select
  using (
    (enabled = true and exists (
      select 1
      from public.storefront_collections sc
      where sc.id = storefront_collection_placements.collection_id
        and sc.is_active = true
    ))
    or public.is_admin()
  );

drop policy if exists storefront_collection_placements_admin_write on public.storefront_collection_placements;
create policy storefront_collection_placements_admin_write
  on public.storefront_collection_placements
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.storefront_collections to anon, authenticated;
grant select on public.storefront_collection_items to anon, authenticated;
grant select on public.storefront_collection_placements to anon, authenticated;
grant insert, update, delete on public.storefront_collections to authenticated;
grant insert, update, delete on public.storefront_collection_items to authenticated;
grant insert, update, delete on public.storefront_collection_placements to authenticated;

comment on table public.storefront_collections is
  'Storefront icin editoryal urun koleksiyonlari. Banner, tema ve sira verisi burada tutulur.';

comment on table public.storefront_collection_items is
  'Bir storefront koleksiyonuna bagli store_items kayitlari ve editor sirasi.';

comment on table public.storefront_collection_placements is
  'Koleksiyonlarin hangi storefront surface/campaign/block slotunda kullanilacagini tanimlar.';