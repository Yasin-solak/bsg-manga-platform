-- Supabase Advisor 0006 continued: FOR ALL write policies on an explicit authenticated role
-- also join the SELECT side, so the remaining four tables are split write-only.

drop policy if exists "fansub_boost_capability_policies_admin_write" on public.fansub_boost_capability_policies;
create policy "fansub_boost_capability_policies_admin_write_insert" on public.fansub_boost_capability_policies for insert to authenticated with check ((select can_manage_moderation_state()));
create policy "fansub_boost_capability_policies_admin_write_update" on public.fansub_boost_capability_policies for update to authenticated using ((select can_manage_moderation_state())) with check ((select can_manage_moderation_state()));
create policy "fansub_boost_capability_policies_admin_write_delete" on public.fansub_boost_capability_policies for delete to authenticated using ((select can_manage_moderation_state()));
alter policy "fansub_boost_capability_policies_select_public" on public.fansub_boost_capability_policies to anon, authenticated using (true);

drop policy if exists "fansub_identity_badge_catalog_admin_write" on public.fansub_identity_badge_catalog;
create policy "fansub_identity_badge_catalog_admin_write_insert" on public.fansub_identity_badge_catalog for insert to authenticated with check ((select can_manage_moderation_state()));
create policy "fansub_identity_badge_catalog_admin_write_update" on public.fansub_identity_badge_catalog for update to authenticated using ((select can_manage_moderation_state())) with check ((select can_manage_moderation_state()));
create policy "fansub_identity_badge_catalog_admin_write_delete" on public.fansub_identity_badge_catalog for delete to authenticated using ((select can_manage_moderation_state()));
alter policy "fansub_identity_badge_catalog_select_public" on public.fansub_identity_badge_catalog to anon, authenticated using (true);

drop policy if exists "fansub_identity_tags_staff_write" on public.fansub_identity_tags;
create policy "fansub_identity_tags_staff_write_insert" on public.fansub_identity_tags for insert to authenticated with check ((select can_manage_moderation_state()) or is_fansub_admin(fansub_id));
create policy "fansub_identity_tags_staff_write_update" on public.fansub_identity_tags for update to authenticated using ((select can_manage_moderation_state()) or is_fansub_admin(fansub_id)) with check ((select can_manage_moderation_state()) or is_fansub_admin(fansub_id));
create policy "fansub_identity_tags_staff_write_delete" on public.fansub_identity_tags for delete to authenticated using ((select can_manage_moderation_state()) or is_fansub_admin(fansub_id));
alter policy "fansub_identity_tags_select_public_active" on public.fansub_identity_tags to anon, authenticated using (
  (select can_manage_moderation_state())
  or (
    (is_active = true)
    and exists (
      select 1
      from public.fansubs f
      where f.id = fansub_identity_tags.fansub_id
        and f.is_active = true
    )
  )
);

drop policy if exists "store_profile_effect_assets_admin_write" on public.store_profile_effect_assets;
create policy "store_profile_effect_assets_admin_write_insert" on public.store_profile_effect_assets for insert to authenticated with check ((select can_manage_moderation_state()));
create policy "store_profile_effect_assets_admin_write_update" on public.store_profile_effect_assets for update to authenticated using ((select can_manage_moderation_state())) with check ((select can_manage_moderation_state()));
create policy "store_profile_effect_assets_admin_write_delete" on public.store_profile_effect_assets for delete to authenticated using ((select can_manage_moderation_state()));
alter policy "store_profile_effect_assets_select_public_active" on public.store_profile_effect_assets to anon, authenticated using ((is_active = true) or (select can_manage_moderation_state()));
