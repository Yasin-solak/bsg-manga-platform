-- Live Supabase Advisor follow-up hardening.
-- Goal: remove login-required RPCs from the anon/public surface,
-- without breaking public read endpoints and RLS public helpers.

begin;

-- The previous migration closed the future default grant. This step clears anon/PUBLIC EXECUTE grants
-- left on existing login-required functions.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any(array[
        'assert_fansub_custom_background_access',
        'block_user',
        'can_write_pending_community_poll_child',
        'can_write_pending_community_post_child',
        'cancel_fansub_invite',
        'claim_active_session',
        'claim_current_user_reading_streak_rewards',
        'claim_fansub_reward_task',
        'claim_user_reward_task',
        'create_fansub_community_post',
        'create_security_event',
        'create_user_manga_list',
        'current_app_role',
        'current_user_has_active_premium',
        'donate_to_fansub',
        'edit_fansub_supporter_asset_presentation',
        'equip_fansub_inventory_item',
        'follow_fansub',
        'follow_manga',
        'follow_user',
        'get_auth_user_profile',
        'get_current_user_reading_streak',
        'get_current_user_reading_streak_summary',
        'get_fansub_manage_analytics_summary',
        'get_fansub_manage_boost_reward_summary',
        'get_fansub_manage_chapter_credit_settings',
        'get_fansub_manage_supporter_assets',
        'get_fansub_monthly_reward_preview',
        'get_followed_activity_feed',
        'get_my_account_economy_snapshot',
        'get_my_account_runtime_snapshot',
        'get_my_fansub_boost_supporter_state',
        'get_my_fansub_identity_tag_selection_state',
        'get_my_fansub_supporter_asset_bundle',
        'get_my_notification_preferences',
        'get_my_private_user_profile',
        'get_my_profile_customization_snapshot',
        'get_my_session_guard_state',
        'get_my_user_identity',
        'get_upload_auth_context',
        'get_user_manga_rating',
        'get_user_reward_metric_value',
        'is_community_post_liked',
        'is_current_user_premium_active',
        'is_fansub_staff_of_user',
        'is_notification_type_enabled',
        'leave_fansub',
        'list_blocked_users',
        'list_fansub_identity_tags_for_management',
        'list_fansub_manage_chapter_credit_overrides',
        'list_fansub_manage_chapters',
        'list_fansub_manage_posts',
        'list_fansub_reward_tasks',
        'list_my_auth_sessions',
        'list_my_community_post_like_states',
        'list_my_selectable_fansub_identity_tags',
        'list_user_reward_tasks',
        'mark_my_onboarding_completed',
        'purchase_fansub_badge',
        'purchase_fansub_boost',
        'purchase_fansub_store_item',
        'purchase_fansub_store_item_with_user_wallet',
        'purchase_store_item',
        'purchase_user_badge',
        'record_auth_session_context',
        'redeem_coin_code',
        'release_my_expired_ban',
        'remove_fansub_chapter',
        'remove_fansub_member',
        'respond_fansub_invite',
        'review_fansub_join_request',
        'revoke_auth_session',
        'send_fansub_invite',
        'send_fansub_special_notification',
        'set_community_comment_reaction',
        'set_community_post_reaction',
        'set_fansub_member_role',
        'set_fansub_member_team_tag',
        'set_manga_comment_reaction',
        'set_my_active_fansub_identity_tag',
        'set_user_manga_list_comment_reaction',
        'set_user_manga_list_rating',
        'soft_delete_fansub_supporter_asset',
        'submit_fansub_join_request',
        'submit_manga_rating',
        'toggle_community_post_like',
        'unblock_user',
        'unfollow_fansub',
        'unfollow_manga',
        'unfollow_user',
        'update_fansub_chapter_for_review',
        'update_fansub_post_for_review',
        'update_my_notification_preferences',
        'update_my_profile_customization',
        'update_my_profile_privacy_settings',
        'update_user_displayed_badges',
        'update_user_manga_list',
        'upsert_fansub_chapter_credit_override',
        'upsert_fansub_chapter_credit_settings',
        'upsert_fansub_identity_tag',
        'upsert_fansub_pinned_notice',
        'upsert_fansub_profile',
        'vote_community_post_poll'
      ])
  loop
    execute format('revoke execute on function %s from anon, public', function_record.signature);
    execute format('grant execute on function %s to authenticated', function_record.signature);
  end loop;
end;
$$;

-- These functions are used inside the trigger/privileged RPC chain; staying as direct
-- client RPC endpoints would widen the notification/audit/identity surface.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any(array[
        'build_fansub_boost_supporter_runtime_capabilities',
        'create_fansub_audit_log',
        'create_fansub_audit_log_from_trigger',
        'generate_unique_username',
        'guard_fansub_custom_background_capabilities',
        'guard_fansub_identifier_rules',
        'guard_fansub_request_identifier_rules',
        'guard_fansub_vanity_slug_change',
        'handle_auth_user_created',
        'is_auth_session_revoked',
        'is_trusted_mutation_stack',
        'maybe_refresh_fansub_boost_snapshot',
        'maybe_refresh_fansub_boost_supporter_state',
        'push_notification',
        'resolve_fansub_identity_tag_selection_state',
        'resolve_fansub_notice_target',
        'resolve_user_active_fansub_identity_tag'
      ])
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', function_record.signature);
    execute format('grant execute on function %s to service_role', function_record.signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
