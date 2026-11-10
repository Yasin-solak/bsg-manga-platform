-- Supabase Advisor 0006: FOR ALL write policies also join the SELECT side,
-- so they looked like a second permissive SELECT policy on the same table.
-- This migration splits old FOR ALL policies into authenticated write-only policies
-- and makes the role scope of existing SELECT policies explicit.

drop policy if exists "badges_admin_write" on public.badges;
create policy "badges_admin_write_insert" on public.badges for insert to authenticated with check ((select is_admin()));
create policy "badges_admin_write_update" on public.badges for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "badges_admin_write_delete" on public.badges for delete to authenticated using ((select is_admin()));
alter policy "badges_select_public" on public.badges to anon, authenticated using ((is_active = true) or (select is_admin()));

drop policy if exists "fansub_boost_plans_admin_write" on public.fansub_boost_plans;
create policy "fansub_boost_plans_admin_write_insert" on public.fansub_boost_plans for insert to authenticated with check ((select is_admin()));
create policy "fansub_boost_plans_admin_write_update" on public.fansub_boost_plans for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "fansub_boost_plans_admin_write_delete" on public.fansub_boost_plans for delete to authenticated using ((select is_admin()));
alter policy "fansub_boost_plans_select_active" on public.fansub_boost_plans to anon, authenticated using ((is_active = true) or (select is_admin()));

drop policy if exists "fansub_inventory_write_admin_or_fansub_admin" on public.fansub_inventory;
create policy "fansub_inventory_write_admin_or_fansub_admin_insert" on public.fansub_inventory for insert to authenticated with check ((select is_admin()) or is_fansub_admin(fansub_id));
create policy "fansub_inventory_write_admin_or_fansub_admin_update" on public.fansub_inventory for update to authenticated using ((select is_admin()) or is_fansub_admin(fansub_id)) with check ((select is_admin()) or is_fansub_admin(fansub_id));
create policy "fansub_inventory_write_admin_or_fansub_admin_delete" on public.fansub_inventory for delete to authenticated using ((select is_admin()) or is_fansub_admin(fansub_id));
alter policy "fansub_inventory_select_public" on public.fansub_inventory to authenticated using ((select is_admin()) or is_fansub_admin(fansub_id));

drop policy if exists "fansub_member_history_admin_write" on public.fansub_member_history;
create policy "fansub_member_history_admin_write_insert" on public.fansub_member_history for insert to authenticated with check ((select is_admin()));
create policy "fansub_member_history_admin_write_update" on public.fansub_member_history for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "fansub_member_history_admin_write_delete" on public.fansub_member_history for delete to authenticated using ((select is_admin()));
alter policy "fansub_member_history_select_rule" on public.fansub_member_history to authenticated using ((select is_admin()) or (user_id = (select current_public_user_id())) or is_fansub_staff(fansub_id));

drop policy if exists "fansub_members_write_admin_or_fansub_admin" on public.fansub_members;
create policy "fansub_members_write_admin_or_fansub_admin_insert" on public.fansub_members for insert to authenticated with check ((select is_admin()) or is_fansub_admin(fansub_id));
create policy "fansub_members_write_admin_or_fansub_admin_update" on public.fansub_members for update to authenticated using ((select is_admin()) or is_fansub_admin(fansub_id)) with check ((select is_admin()) or is_fansub_admin(fansub_id));
create policy "fansub_members_write_admin_or_fansub_admin_delete" on public.fansub_members for delete to authenticated using ((select is_admin()) or is_fansub_admin(fansub_id));
alter policy "fansub_members_select_public" on public.fansub_members to anon, authenticated using (true);

drop policy if exists "fansub_monthly_reward_results_admin_write" on public.fansub_monthly_reward_results;
create policy "fansub_monthly_reward_results_admin_write_insert" on public.fansub_monthly_reward_results for insert to authenticated with check ((select is_admin()));
create policy "fansub_monthly_reward_results_admin_write_update" on public.fansub_monthly_reward_results for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "fansub_monthly_reward_results_admin_write_delete" on public.fansub_monthly_reward_results for delete to authenticated using ((select is_admin()));
alter policy "fansub_monthly_reward_results_select_admin_or_own_staff" on public.fansub_monthly_reward_results to authenticated using ((select is_admin()) or is_fansub_staff(fansub_id));

drop policy if exists "fansub_monthly_reward_runs_admin_write" on public.fansub_monthly_reward_runs;
create policy "fansub_monthly_reward_runs_admin_write_insert" on public.fansub_monthly_reward_runs for insert to authenticated with check ((select is_admin()));
create policy "fansub_monthly_reward_runs_admin_write_update" on public.fansub_monthly_reward_runs for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "fansub_monthly_reward_runs_admin_write_delete" on public.fansub_monthly_reward_runs for delete to authenticated using ((select is_admin()));
alter policy "fansub_monthly_reward_runs_select_admin" on public.fansub_monthly_reward_runs to authenticated using ((select is_admin()));

drop policy if exists "fansub_reward_rank_rules_admin_write" on public.fansub_reward_rank_rules;
create policy "fansub_reward_rank_rules_admin_write_insert" on public.fansub_reward_rank_rules for insert to authenticated with check ((select is_admin()));
create policy "fansub_reward_rank_rules_admin_write_update" on public.fansub_reward_rank_rules for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "fansub_reward_rank_rules_admin_write_delete" on public.fansub_reward_rank_rules for delete to authenticated using ((select is_admin()));
alter policy "fansub_reward_rank_rules_select_authenticated" on public.fansub_reward_rank_rules to authenticated using (((select auth.role()) = 'authenticated'::text) or (select is_admin()));

drop policy if exists "fansub_reward_tasks_admin_write" on public.fansub_reward_tasks;
create policy "fansub_reward_tasks_admin_write_insert" on public.fansub_reward_tasks for insert to authenticated with check ((select is_admin()));
create policy "fansub_reward_tasks_admin_write_update" on public.fansub_reward_tasks for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "fansub_reward_tasks_admin_write_delete" on public.fansub_reward_tasks for delete to authenticated using ((select is_admin()));
alter policy "fansub_reward_tasks_select_authenticated" on public.fansub_reward_tasks to authenticated using (((select auth.role()) = 'authenticated'::text) or (select is_admin()));

drop policy if exists "fansub_reward_view_tiers_admin_write" on public.fansub_reward_view_tiers;
create policy "fansub_reward_view_tiers_admin_write_insert" on public.fansub_reward_view_tiers for insert to authenticated with check ((select is_admin()));
create policy "fansub_reward_view_tiers_admin_write_update" on public.fansub_reward_view_tiers for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "fansub_reward_view_tiers_admin_write_delete" on public.fansub_reward_view_tiers for delete to authenticated using ((select is_admin()));
alter policy "fansub_reward_view_tiers_select_authenticated" on public.fansub_reward_view_tiers to authenticated using (((select auth.role()) = 'authenticated'::text) or (select is_admin()));

drop policy if exists "fansub_supporter_assets_staff_write" on public.fansub_supporter_assets;
create policy "fansub_supporter_assets_staff_write_insert" on public.fansub_supporter_assets for insert to authenticated with check ((select is_admin()) or is_fansub_staff(fansub_id));
create policy "fansub_supporter_assets_staff_write_update" on public.fansub_supporter_assets for update to authenticated using ((select is_admin()) or is_fansub_staff(fansub_id)) with check ((select is_admin()) or is_fansub_staff(fansub_id));
create policy "fansub_supporter_assets_staff_write_delete" on public.fansub_supporter_assets for delete to authenticated using ((select is_admin()) or is_fansub_staff(fansub_id));
alter policy "fansub_supporter_assets_staff_read" on public.fansub_supporter_assets to authenticated using ((select is_admin()) or is_fansub_staff(fansub_id));

drop policy if exists "feature_flags_admin_write" on public.feature_flags;
create policy "feature_flags_admin_write_insert" on public.feature_flags for insert to authenticated with check ((select is_admin()));
create policy "feature_flags_admin_write_update" on public.feature_flags for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "feature_flags_admin_write_delete" on public.feature_flags for delete to authenticated using ((select is_admin()));
alter policy "feature_flags_select_rule" on public.feature_flags to anon, authenticated using ((select is_admin()) or (is_public = true));

drop policy if exists "manga_monthly_views_admin_write" on public.manga_monthly_views;
create policy "manga_monthly_views_admin_write_insert" on public.manga_monthly_views for insert to authenticated with check ((select is_admin()));
create policy "manga_monthly_views_admin_write_update" on public.manga_monthly_views for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "manga_monthly_views_admin_write_delete" on public.manga_monthly_views for delete to authenticated using ((select is_admin()));
alter policy "manga_monthly_views_select_admin_or_fansub_staff" on public.manga_monthly_views to authenticated using ((select is_admin()) or ((fansub_id is not null) and is_fansub_staff(fansub_id)));

drop policy if exists "manga_read_trackers_admin_write" on public.manga_read_trackers;
create policy "manga_read_trackers_admin_write_insert" on public.manga_read_trackers for insert to authenticated with check ((select is_admin()));
create policy "manga_read_trackers_admin_write_update" on public.manga_read_trackers for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "manga_read_trackers_admin_write_delete" on public.manga_read_trackers for delete to authenticated using ((select is_admin()));
alter policy "manga_read_trackers_select_admin" on public.manga_read_trackers to authenticated using ((select is_admin()));

drop policy if exists "premium_monthly_packages_admin_write" on public.premium_monthly_packages;
create policy "premium_monthly_packages_admin_write_insert" on public.premium_monthly_packages for insert to authenticated with check ((select is_admin()));
create policy "premium_monthly_packages_admin_write_update" on public.premium_monthly_packages for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "premium_monthly_packages_admin_write_delete" on public.premium_monthly_packages for delete to authenticated using ((select is_admin()));
alter policy "premium_monthly_packages_select_public" on public.premium_monthly_packages to anon, authenticated using ((is_active = true) or (select is_admin()));

drop policy if exists "premium_runtime_config_admin_write" on public.premium_runtime_config;
create policy "premium_runtime_config_admin_write_insert" on public.premium_runtime_config for insert to authenticated with check ((select is_admin()));
create policy "premium_runtime_config_admin_write_update" on public.premium_runtime_config for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "premium_runtime_config_admin_write_delete" on public.premium_runtime_config for delete to authenticated using ((select is_admin()));
alter policy "premium_runtime_config_select_public" on public.premium_runtime_config to anon, authenticated using (true);

drop policy if exists "reading_streak_reward_rules_admin_write" on public.reading_streak_reward_rules;
create policy "reading_streak_reward_rules_admin_write_insert" on public.reading_streak_reward_rules for insert to authenticated with check ((select is_admin()));
create policy "reading_streak_reward_rules_admin_write_update" on public.reading_streak_reward_rules for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "reading_streak_reward_rules_admin_write_delete" on public.reading_streak_reward_rules for delete to authenticated using ((select is_admin()));
alter policy "reading_streak_reward_rules_select_authenticated" on public.reading_streak_reward_rules to authenticated using (((select auth.role()) = 'authenticated'::text) or (select is_admin()));

drop policy if exists "redeem_codes_admin_write" on public.redeem_codes;
create policy "redeem_codes_admin_write_insert" on public.redeem_codes for insert to authenticated with check ((select is_admin()));
create policy "redeem_codes_admin_write_update" on public.redeem_codes for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "redeem_codes_admin_write_delete" on public.redeem_codes for delete to authenticated using ((select is_admin()));
alter policy "redeem_codes_select_active" on public.redeem_codes to authenticated using ((((select auth.role()) = 'authenticated'::text) and (is_active = true) and (expires_at > now())) or (select is_admin()));

drop policy if exists "site_announcements_admin_write" on public.site_announcements;
create policy "site_announcements_admin_write_insert" on public.site_announcements for insert to authenticated with check ((select is_admin()));
create policy "site_announcements_admin_write_update" on public.site_announcements for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "site_announcements_admin_write_delete" on public.site_announcements for delete to authenticated using ((select is_admin()));
alter policy "site_announcements_select_public" on public.site_announcements to anon, authenticated using ((is_active = true) or (select is_admin()));

drop policy if exists "site_settings_admin_write" on public.site_settings;
create policy "site_settings_admin_write_insert" on public.site_settings for insert to authenticated with check ((select is_admin()));
create policy "site_settings_admin_write_update" on public.site_settings for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "site_settings_admin_write_delete" on public.site_settings for delete to authenticated using ((select is_admin()));
alter policy "site_settings_select_public" on public.site_settings to anon, authenticated using (true);

drop policy if exists "store_items_admin_write" on public.store_items;
create policy "store_items_admin_write_insert" on public.store_items for insert to authenticated with check ((select is_admin()));
create policy "store_items_admin_write_update" on public.store_items for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "store_items_admin_write_delete" on public.store_items for delete to authenticated using ((select is_admin()));
alter policy "store_items_select_public" on public.store_items to anon, authenticated using ((is_active = true) or (select is_admin()));

drop policy if exists "storefront_collection_items_admin_write" on public.storefront_collection_items;
create policy "storefront_collection_items_admin_write_insert" on public.storefront_collection_items for insert to authenticated with check ((select is_admin()));
create policy "storefront_collection_items_admin_write_update" on public.storefront_collection_items for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "storefront_collection_items_admin_write_delete" on public.storefront_collection_items for delete to authenticated using ((select is_admin()));
alter policy "storefront_collection_items_select_public" on public.storefront_collection_items to anon, authenticated using (
  exists (
    select 1
    from public.storefront_collections sc
    where sc.id = storefront_collection_items.collection_id
      and ((sc.is_active = true) or (select is_admin()))
  )
);

drop policy if exists "storefront_collection_placements_admin_write" on public.storefront_collection_placements;
create policy "storefront_collection_placements_admin_write_insert" on public.storefront_collection_placements for insert to authenticated with check ((select is_admin()));
create policy "storefront_collection_placements_admin_write_update" on public.storefront_collection_placements for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "storefront_collection_placements_admin_write_delete" on public.storefront_collection_placements for delete to authenticated using ((select is_admin()));
alter policy "storefront_collection_placements_select_public" on public.storefront_collection_placements to anon, authenticated using (
  (
    (enabled = true)
    and exists (
      select 1
      from public.storefront_collections sc
      where sc.id = storefront_collection_placements.collection_id
        and sc.is_active = true
    )
  )
  or (select is_admin())
);

drop policy if exists "storefront_collections_admin_write" on public.storefront_collections;
create policy "storefront_collections_admin_write_insert" on public.storefront_collections for insert to authenticated with check ((select is_admin()));
create policy "storefront_collections_admin_write_update" on public.storefront_collections for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "storefront_collections_admin_write_delete" on public.storefront_collections for delete to authenticated using ((select is_admin()));
alter policy "storefront_collections_select_public" on public.storefront_collections to anon, authenticated using ((is_active = true) or (select is_admin()));

drop policy if exists "user_premium_grants_admin_write" on public.user_premium_grants;
create policy "user_premium_grants_admin_write_insert" on public.user_premium_grants for insert to authenticated with check ((select is_admin()));
create policy "user_premium_grants_admin_write_update" on public.user_premium_grants for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "user_premium_grants_admin_write_delete" on public.user_premium_grants for delete to authenticated using ((select is_admin()));
alter policy "user_premium_grants_select_own_or_admin" on public.user_premium_grants to authenticated using ((user_id = (select current_public_user_id())) or (select is_admin()));

drop policy if exists "user_premium_reward_events_admin_write" on public.user_premium_reward_events;
create policy "user_premium_reward_events_admin_write_insert" on public.user_premium_reward_events for insert to authenticated with check ((select is_admin()));
create policy "user_premium_reward_events_admin_write_update" on public.user_premium_reward_events for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "user_premium_reward_events_admin_write_delete" on public.user_premium_reward_events for delete to authenticated using ((select is_admin()));
alter policy "user_premium_reward_events_select_own_or_admin" on public.user_premium_reward_events to authenticated using ((user_id = (select current_public_user_id())) or (select is_admin()));

drop policy if exists "user_premium_subscriptions_admin_write" on public.user_premium_subscriptions;
create policy "user_premium_subscriptions_admin_write_insert" on public.user_premium_subscriptions for insert to authenticated with check ((select is_admin()));
create policy "user_premium_subscriptions_admin_write_update" on public.user_premium_subscriptions for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "user_premium_subscriptions_admin_write_delete" on public.user_premium_subscriptions for delete to authenticated using ((select is_admin()));
alter policy "user_premium_subscriptions_select_own_or_admin" on public.user_premium_subscriptions to authenticated using ((user_id = (select current_public_user_id())) or (select is_admin()));

drop policy if exists "user_reward_tasks_admin_write" on public.user_reward_tasks;
create policy "user_reward_tasks_admin_write_insert" on public.user_reward_tasks for insert to authenticated with check ((select is_admin()));
create policy "user_reward_tasks_admin_write_update" on public.user_reward_tasks for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "user_reward_tasks_admin_write_delete" on public.user_reward_tasks for delete to authenticated using ((select is_admin()));
alter policy "user_reward_tasks_select_authenticated" on public.user_reward_tasks to authenticated using (((select auth.role()) = 'authenticated'::text) or (select is_admin()));
