begin;

create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated, service_role;
grant execute on function app_private.current_public_user_id() to authenticated, service_role;
grant execute on function app_private.get_profile_view_access(uuid) to anon, authenticated, service_role;
grant execute on function app_private.can_manage_moderation_state() to anon, authenticated, service_role;
grant execute on function app_private.resolve_user_active_fansub_identity_tag(uuid) to anon, authenticated, service_role;

create or replace function app_private.visible_profile_background_for_user(
  p_user_id uuid,
  p_background_type text
)
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select app_private.visible_profile_background_type(
    p_background_type,
    (
      select u.premium_expires_at
      from public.users as u
      where u.id = p_user_id
      limit 1
    )
  )
$function$;

revoke execute on function app_private.visible_profile_background_for_user(uuid, text) from public;
grant execute on function app_private.visible_profile_background_for_user(uuid, text)
  to anon, authenticated, service_role;

create or replace view public.public_user_directory
with (security_invoker = true)
as
select
  u.id,
  u.username,
  u.avatar_url,
  u.frame_type,
  app_private.visible_profile_background_for_user(u.id, u.background_type) as background_type,
  app_private.resolve_user_active_fansub_identity_tag(u.id) as active_fansub_identity_tag
from public.users as u
cross join lateral app_private.get_profile_view_access(u.id) as access(
  is_owner,
  viewer_is_follower,
  profile_visible,
  stats_visible,
  social_links_visible,
  activity_visible,
  profile_visibility,
  stats_visibility,
  social_links_visibility,
  activity_visibility
)
where coalesce(u.is_active, true) = true
  and coalesce(u.is_banned, false) = false
  and (
    app_private.can_manage_moderation_state()
    or coalesce(access.profile_visible, false) = true
  );

grant select on public.public_user_directory to anon, authenticated;

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
alter table public.store_purchase_requests enable row level security;
alter table public.store_item_gifts enable row level security;
alter table public.store_package_events enable row level security;

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

revoke all on table public.store_wishlist_items from anon, authenticated;
revoke select on table public.store_purchase_requests from anon;
revoke select on table public.store_item_gifts from anon;
revoke select on table public.store_package_events from anon;

grant select, insert, delete on table public.store_wishlist_items to authenticated;
grant select on table public.store_purchase_requests to authenticated;
grant select on table public.store_item_gifts to authenticated;
grant select on table public.store_package_events to authenticated;

comment on function app_private.visible_profile_background_for_user(uuid, text)
  is 'Public profil projectioninda premium bitis tarihini expose etmeden gorunur arka plani cozer.';

comment on table public.store_wishlist_items
  is 'Kullanicinin magaza urunu ve kozmetik paket istek listesini RLS ile saklar.';

notify pgrst, 'reload schema';

commit;
