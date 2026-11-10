begin;

create table if not exists public.store_wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('item', 'package')),
  store_item_id uuid references public.store_items(id) on delete cascade,
  package_key text references public.store_cosmetic_packages(package_key) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  constraint store_wishlist_items_target_check check (
    (target_kind = 'item' and store_item_id is not null and package_key is null)
    or (target_kind = 'package' and package_key is not null and store_item_id is null)
  )
);

create unique index if not exists store_wishlist_items_user_item_key
  on public.store_wishlist_items (user_id, store_item_id)
  where store_item_id is not null;

create unique index if not exists store_wishlist_items_user_package_key
  on public.store_wishlist_items (user_id, package_key)
  where package_key is not null;

create index if not exists store_wishlist_items_user_created_idx
  on public.store_wishlist_items (user_id, created_at desc);

alter table public.store_wishlist_items enable row level security;

drop policy if exists store_wishlist_items_select_owner on public.store_wishlist_items;
create policy store_wishlist_items_select_owner
  on public.store_wishlist_items
  for select
  to authenticated
  using (user_id = (select app_private.current_public_user_id()));

drop policy if exists store_wishlist_items_insert_owner on public.store_wishlist_items;
create policy store_wishlist_items_insert_owner
  on public.store_wishlist_items
  for insert
  to authenticated
  with check (user_id = (select app_private.current_public_user_id()));

drop policy if exists store_wishlist_items_delete_owner on public.store_wishlist_items;
create policy store_wishlist_items_delete_owner
  on public.store_wishlist_items
  for delete
  to authenticated
  using (user_id = (select app_private.current_public_user_id()));

revoke all on table public.store_wishlist_items from anon, authenticated;
grant select, insert, delete on table public.store_wishlist_items to authenticated;

drop policy if exists store_item_gifts_select_participant on public.store_item_gifts;
create policy store_item_gifts_select_participant
  on public.store_item_gifts
  for select
  to authenticated
  using (
    sender_user_id = (select app_private.current_public_user_id())
    or recipient_user_id = (select app_private.current_public_user_id())
  );

drop policy if exists store_package_events_select_participant on public.store_package_events;
create policy store_package_events_select_participant
  on public.store_package_events
  for select
  to authenticated
  using (
    actor_user_id = (select app_private.current_public_user_id())
    or recipient_user_id = (select app_private.current_public_user_id())
  );

grant select on table public.store_item_gifts to authenticated;
grant select on table public.store_package_events to authenticated;

comment on table public.store_wishlist_items
  is 'Kullanicinin magaza urunu ve kozmetik paket istek listesini RLS ile saklar.';

notify pgrst, 'reload schema';

commit;
