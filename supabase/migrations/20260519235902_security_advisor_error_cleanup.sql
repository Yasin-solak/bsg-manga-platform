begin;

alter view if exists public.admin_stats
  set (security_invoker = true);

create or replace function public.get_admin_user_directory_rows()
returns table (
  id uuid,
  username text,
  avatar_url text,
  role text,
  is_banned boolean,
  ban_reason text,
  ban_until timestamptz,
  banned_at timestamptz,
  banned_by uuid,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_moderation_state() then
    return;
  end if;

  return query
  select
    u.id,
    u.username,
    u.avatar_url,
    u.role,
    u.is_banned,
    u.ban_reason,
    u.ban_until,
    u.banned_at,
    u.banned_by,
    u.is_active,
    u.created_at,
    u.updated_at
  from public.users as u;
end;
$$;

revoke all on function public.get_admin_user_directory_rows() from public;
grant execute on function public.get_admin_user_directory_rows() to authenticated;

drop view if exists public.admin_user_directory;
create view public.admin_user_directory
with (security_invoker = true, security_barrier = true)
as
select *
from public.get_admin_user_directory_rows();

revoke all on public.admin_user_directory from public;
grant select on public.admin_user_directory to authenticated;

comment on view public.admin_user_directory
  is 'Security invoker admin projection. Hassas users kolonlari view definer yetkisiyle acilmaz; admin kontrolu dar RPC icinde yapilir.';

alter table public.user_notification_preferences enable row level security;

drop policy if exists user_notification_preferences_select_own on public.user_notification_preferences;
create policy user_notification_preferences_select_own
  on public.user_notification_preferences
  for select
  to authenticated
  using (user_id = public.current_public_user_id() or public.can_manage_moderation_state());

drop policy if exists user_notification_preferences_insert_own on public.user_notification_preferences;
create policy user_notification_preferences_insert_own
  on public.user_notification_preferences
  for insert
  to authenticated
  with check (user_id = public.current_public_user_id() or public.can_manage_moderation_state());

drop policy if exists user_notification_preferences_update_own on public.user_notification_preferences;
create policy user_notification_preferences_update_own
  on public.user_notification_preferences
  for update
  to authenticated
  using (user_id = public.current_public_user_id() or public.can_manage_moderation_state())
  with check (user_id = public.current_public_user_id() or public.can_manage_moderation_state());

alter table public.store_profile_effect_assets enable row level security;

drop policy if exists store_profile_effect_assets_select_public_active on public.store_profile_effect_assets;
create policy store_profile_effect_assets_select_public_active
  on public.store_profile_effect_assets
  for select
  to anon, authenticated
  using (is_active = true or public.can_manage_moderation_state());

drop policy if exists store_profile_effect_assets_admin_write on public.store_profile_effect_assets;
create policy store_profile_effect_assets_admin_write
  on public.store_profile_effect_assets
  for all
  to authenticated
  using (public.can_manage_moderation_state())
  with check (public.can_manage_moderation_state());

grant select on public.store_profile_effect_assets to anon, authenticated;
grant insert, update, delete on public.store_profile_effect_assets to authenticated;

alter table public.fansub_identity_badge_catalog enable row level security;

drop policy if exists fansub_identity_badge_catalog_select_public on public.fansub_identity_badge_catalog;
create policy fansub_identity_badge_catalog_select_public
  on public.fansub_identity_badge_catalog
  for select
  to anon, authenticated
  using (true);

drop policy if exists fansub_identity_badge_catalog_admin_write on public.fansub_identity_badge_catalog;
create policy fansub_identity_badge_catalog_admin_write
  on public.fansub_identity_badge_catalog
  for all
  to authenticated
  using (public.can_manage_moderation_state())
  with check (public.can_manage_moderation_state());

grant select on public.fansub_identity_badge_catalog to anon, authenticated;
grant insert, update, delete on public.fansub_identity_badge_catalog to authenticated;

alter table public.fansub_identity_tags enable row level security;

drop policy if exists fansub_identity_tags_select_public_active on public.fansub_identity_tags;
create policy fansub_identity_tags_select_public_active
  on public.fansub_identity_tags
  for select
  to anon, authenticated
  using (
    public.can_manage_moderation_state()
    or (
      is_active = true
      and exists (
        select 1
        from public.fansubs as f
        where f.id = fansub_identity_tags.fansub_id
          and f.is_active = true
      )
    )
  );

drop policy if exists fansub_identity_tags_staff_write on public.fansub_identity_tags;
create policy fansub_identity_tags_staff_write
  on public.fansub_identity_tags
  for all
  to authenticated
  using (public.can_manage_moderation_state() or public.is_fansub_admin(fansub_id))
  with check (public.can_manage_moderation_state() or public.is_fansub_admin(fansub_id));

alter table public.user_selected_fansub_identity_tags enable row level security;

drop policy if exists user_selected_fansub_identity_tags_select_own on public.user_selected_fansub_identity_tags;
create policy user_selected_fansub_identity_tags_select_own
  on public.user_selected_fansub_identity_tags
  for select
  to authenticated
  using (user_id = public.current_public_user_id() or public.can_manage_moderation_state());

drop policy if exists user_selected_fansub_identity_tags_insert_own on public.user_selected_fansub_identity_tags;
create policy user_selected_fansub_identity_tags_insert_own
  on public.user_selected_fansub_identity_tags
  for insert
  to authenticated
  with check (user_id = public.current_public_user_id() or public.can_manage_moderation_state());

drop policy if exists user_selected_fansub_identity_tags_update_own on public.user_selected_fansub_identity_tags;
create policy user_selected_fansub_identity_tags_update_own
  on public.user_selected_fansub_identity_tags
  for update
  to authenticated
  using (user_id = public.current_public_user_id() or public.can_manage_moderation_state())
  with check (user_id = public.current_public_user_id() or public.can_manage_moderation_state());

drop policy if exists user_selected_fansub_identity_tags_delete_own on public.user_selected_fansub_identity_tags;
create policy user_selected_fansub_identity_tags_delete_own
  on public.user_selected_fansub_identity_tags
  for delete
  to authenticated
  using (user_id = public.current_public_user_id() or public.can_manage_moderation_state());

alter table public.fansub_boost_capability_policies enable row level security;

drop policy if exists fansub_boost_capability_policies_select_public on public.fansub_boost_capability_policies;
create policy fansub_boost_capability_policies_select_public
  on public.fansub_boost_capability_policies
  for select
  to anon, authenticated
  using (true);

drop policy if exists fansub_boost_capability_policies_admin_write on public.fansub_boost_capability_policies;
create policy fansub_boost_capability_policies_admin_write
  on public.fansub_boost_capability_policies
  for all
  to authenticated
  using (public.can_manage_moderation_state())
  with check (public.can_manage_moderation_state());

grant select on public.fansub_boost_capability_policies to anon, authenticated;
grant insert, update, delete on public.fansub_boost_capability_policies to authenticated;

commit;
