begin;

create schema if not exists app_private;

grant usage on schema app_private to authenticated, service_role;
grant execute on function app_private.current_public_user_id() to authenticated, service_role;

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

drop policy if exists store_purchase_requests_owner_read on public.store_purchase_requests;
create policy store_purchase_requests_owner_read
  on public.store_purchase_requests
  for select
  to authenticated
  using (user_id = (select app_private.current_public_user_id()));

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

revoke select on table public.store_wishlist_items from anon;
revoke select on table public.store_purchase_requests from anon;
revoke select on table public.store_item_gifts from anon;
revoke select on table public.store_package_events from anon;

grant select, insert, delete on table public.store_wishlist_items to authenticated;
grant select on table public.store_purchase_requests to authenticated;
grant select on table public.store_item_gifts to authenticated;
grant select on table public.store_package_events to authenticated;

notify pgrst, 'reload schema';

commit;
