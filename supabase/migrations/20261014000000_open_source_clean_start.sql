-- Open source clean start.
--
-- Old migrations added sample data during development (demo users, fansubs, mangas,
-- community posts, shop products). On a fresh install these samples are deleted;
-- settings and catalog tables (feature flags, task definitions, level rules, badges, name
-- effects, Murek wardrobe, Premium settings) are kept. The next migration adds Murek products
-- and name styles.
--
-- DELETE (not TRUNCATE): TRUNCATE CASCADE would also empty settings tables tied to users by created_by
-- . Business rule triggers are disabled during the bulk cleanup (foreign key
-- rules keep working).
do $clean$
declare
  v_tables text[] := array[
    'public.store_wallet_ledger',
    'public.shop_orders',
    'public.store_order_items',
    'public.store_orders',
    'public.store_purchase_requests',
    'public.user_inventory_items',
    'public.user_premium_grants',
    'public.user_premium_reward_events',
    'public.user_premium_subscriptions',
    'public.store_item_gifts',
    'public.store_item_analytics_events',
    'public.store_package_events',
    'public.store_wishlist_items',
    'public.shop_wishlist',
    'public.shop_reminders',
    'public.premium_monthly_packages',
    'public.store_cosmetic_packages',
    'public.storefront_collection_items',
    'public.storefront_collection_placements',
    'public.storefront_collections',
    'public.storefront_home_assets',
    'public.storefront_home_campaigns',
    'public.storefront_home_collections',
    'public.storefront_homepage_drafts',
    'public.storefront_homepage_snapshots',
    'app_private.studio_purge_targets',
    'public.studio_page_layers',
    'public.studio_regions',
    'public.studio_translations',
    'public.studio_jobs',
    'public.studio_publications',
    'public.studio_pages',
    'public.studio_projects',
    'public.translation_suggestions',
    'public.translation_item_texts',
    'public.translation_items',
    'public.translation_page_cleanup',
    'public.translation_page_tasks',
    'public.translation_page_versions',
    'public.translation_pages',
    'public.translation_jobs',
    'public.translation_content_reviews',
    'public.translation_ai_usage',
    'public.translation_fansub_quotas',
    'public.translation_glossary',
    'public.translation_series_drafts',
    'public.translation_projects',
    'public.admin_typeset_glossary_terms',
    'public.admin_typeset_works',
    'public.typeset_studio_pilot_fansubs',
    'public.community_comment_reactions',
    'public.community_comments',
    'public.community_post_assets',
    'public.community_post_likes',
    'public.community_post_poll_votes',
    'public.community_post_poll_options',
    'public.community_post_polls',
    'public.community_post_reactions',
    'public.community_post_view_events',
    'public.community_posts',
    'public.manga_comment_reactions',
    'public.manga_comments',
    'public.manga_follows',
    'public.manga_monthly_views',
    'public.manga_ratings',
    'public.manga_read_trackers',
    'public.reading_history',
    'public.reading_streak_reward_claims',
    'public.release_schedule_reminders',
    'public.user_manga_list_comment_reactions',
    'public.user_manga_list_comments',
    'public.user_manga_list_items',
    'public.user_manga_list_ratings',
    'public.user_manga_lists',
    'public.user_reading_plan_items',
    'public.user_badges',
    'public.user_blocks',
    'public.user_code_redemptions',
    'public.user_follow_requests',
    'public.user_follows',
    'public.user_level_snapshots',
    'public.user_murek',
    'public.user_notification_preferences',
    'public.user_profile_layouts',
    'public.user_reward_task_claims',
    'public.user_selected_fansub_identity_tags',
    'public.fansub_audit_logs',
    'public.fansub_badges',
    'public.fansub_boost_grants',
    'public.fansub_boost_snapshots',
    'public.fansub_boost_supporter_states',
    'public.fansub_chapter_credit_overrides',
    'public.fansub_chapter_credit_settings',
    'public.fansub_code_redemptions',
    'public.fansub_follows',
    'public.fansub_identity_tags',
    'public.fansub_inventory',
    'public.fansub_invites',
    'public.fansub_join_requests',
    'public.fansub_member_history',
    'public.fansub_member_roles',
    'public.fansub_members',
    'public.fansub_monthly_reward_results',
    'public.fansub_monthly_reward_runs',
    'public.fansub_pinned_notices',
    'public.fansub_reported_content',
    'public.fansub_requests',
    'public.fansub_reward_task_claims',
    'public.fansub_roles',
    'public.fansub_special_notification_broadcasts',
    'public.fansub_supporter_asset_revisions',
    'public.fansub_supporter_assets',
    'public.fansub_transactions',
    'public.daily_game_plays',
    'public.daily_game_runs',
    'public.istila_spawns',
    'public.quest_progress',
    'public.quest_events',
    'public.redeem_code_attempts',
    'public.redeem_codes',
    'public.notifications',
    'public.push_subscriptions',
    'public.reports',
    'public.legal_requests',
    'public.pending_content_revisions',
    'public.site_announcements',
    'public.security_alert_mutes',
    'public.security_alerts',
    'public.security_events',
    'public.activity_events',
    'public.audit_logs',
    'public.chapters',
    'public.mangas',
    'public.fansubs',
    'app_private.user_xp_events',
    'app_private.studio_ai_daily_project_usage'
  ];
  v_t text;
  v_pass integer := 0;
  v_blocked integer;
  v_last_error text;
  v_all text[];
begin

  create temp table _keep_products (id uuid) on commit drop;
  create temp table _keep_items (id uuid) on commit drop;

  -- In a bulk cleanup business rule triggers (approval / audit / append-only guards) get in the way
  -- : only user-defined triggers are disabled; foreign key rules (internal
  -- triggers) keep working. Re-enabled at the end.
  v_all := v_tables || array['public.users', 'public.store_items', 'public.store_profile_effect_assets', 'public.shop_products',
    'public.shop_product_grants', 'public.shop_campaigns', 'public.shop_campaign_products', 'public.shop_seasons',
    'public.shop_discounts', 'public.shop_daily_deal_overrides']
    || array(select format('%I.%I', n.nspname, c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where c.relkind = 'r' and n.nspname in ('community_v2', 'announcement_internal'));
  foreach v_t in array v_all loop
    continue when to_regclass(v_t) is null;
    execute format('alter table %s disable trigger user', v_t);
  end loop;

  -- The cosmetic required by the Premium system (premium_runtime_config) is always kept.
  insert into _keep_items select premium_store_item_id from public.premium_runtime_config where premium_store_item_id is not null;

  -- Dukkan: korunmayan kampanya baglari / gunluk firsatlar / indirimler.
  delete from public.shop_campaign_products where product_id not in (select id from _keep_products);
  delete from public.shop_daily_deal_overrides where product_id not in (select id from _keep_products);
  delete from public.shop_discounts d
  where d.season_id is null
     or d.season_id not in (select p.season_id from public.shop_products p where p.id in (select id from _keep_products) and p.season_id is not null);

  -- Data tables: repeated passes since foreign key order is unknown; a blocked table waits for the
  -- next pass. DELETE follows each relation's own ON DELETE rule (TRUNCATE CASCADE also emptied settings
  -- tables: feature_flags, premium_perks... tied to users by created_by).
  loop
    v_pass := v_pass + 1;
    v_blocked := 0;
    foreach v_t in array v_tables loop
      continue when to_regclass(v_t) is null;
      begin
        execute format('delete from %s', v_t);
      exception when foreign_key_violation then
        v_blocked := v_blocked + 1;
        v_last_error := v_t || ': ' || sqlerrm;
      end;
    end loop;
    -- All data of the community and announcement systems (servers, messages, announcements); the settings table stays.
    for v_t in
      select format('%I.%I', n.nspname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('community_v2', 'announcement_internal') and c.relname <> 'operations_config'
    loop
      begin
        execute format('delete from %s', v_t);
      exception when foreign_key_violation then
        v_blocked := v_blocked + 1;
        v_last_error := v_t || ': ' || sqlerrm;
      end;
    end loop;
    exit when v_blocked = 0;
    if v_pass >= 12 then
      raise exception 'Temizlik tamamlanamadi (% engel), son: %', v_blocked, v_last_error;
    end if;
  end loop;

  delete from public.shop_product_grants where product_id not in (select id from _keep_products);
  delete from public.shop_products where id not in (select id from _keep_products);
  delete from public.shop_campaigns c where not exists (select 1 from public.shop_campaign_products x where x.campaign_id = c.id);
  delete from public.shop_seasons s where not exists (select 1 from public.shop_products p where p.season_id = s.id);
  delete from public.store_profile_effect_assets where item_id not in (select id from _keep_items);
  delete from public.store_items where id not in (select id from _keep_items);
  delete from public.users;

  foreach v_t in array v_all loop
    continue when to_regclass(v_t) is null;
    execute format('alter table %s enable trigger user', v_t);
  end loop;
end
$clean$;
