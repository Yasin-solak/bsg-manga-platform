import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235905_public_for_all_policy_split.sql',
  'utf8',
);

const writePolicies = [
  ['badges', 'badges_admin_write'],
  ['fansub_boost_plans', 'fansub_boost_plans_admin_write'],
  ['fansub_inventory', 'fansub_inventory_write_admin_or_fansub_admin'],
  ['fansub_member_history', 'fansub_member_history_admin_write'],
  ['fansub_members', 'fansub_members_write_admin_or_fansub_admin'],
  ['fansub_monthly_reward_results', 'fansub_monthly_reward_results_admin_write'],
  ['fansub_monthly_reward_runs', 'fansub_monthly_reward_runs_admin_write'],
  ['fansub_reward_rank_rules', 'fansub_reward_rank_rules_admin_write'],
  ['fansub_reward_tasks', 'fansub_reward_tasks_admin_write'],
  ['fansub_reward_view_tiers', 'fansub_reward_view_tiers_admin_write'],
  ['fansub_supporter_assets', 'fansub_supporter_assets_staff_write'],
  ['feature_flags', 'feature_flags_admin_write'],
  ['manga_monthly_views', 'manga_monthly_views_admin_write'],
  ['manga_read_trackers', 'manga_read_trackers_admin_write'],
  ['premium_monthly_packages', 'premium_monthly_packages_admin_write'],
  ['premium_runtime_config', 'premium_runtime_config_admin_write'],
  ['reading_streak_reward_rules', 'reading_streak_reward_rules_admin_write'],
  ['redeem_codes', 'redeem_codes_admin_write'],
  ['site_announcements', 'site_announcements_admin_write'],
  ['site_settings', 'site_settings_admin_write'],
  ['store_items', 'store_items_admin_write'],
  ['storefront_collection_items', 'storefront_collection_items_admin_write'],
  ['storefront_collection_placements', 'storefront_collection_placements_admin_write'],
  ['storefront_collections', 'storefront_collections_admin_write'],
  ['user_premium_grants', 'user_premium_grants_admin_write'],
  ['user_premium_reward_events', 'user_premium_reward_events_admin_write'],
  ['user_premium_subscriptions', 'user_premium_subscriptions_admin_write'],
  ['user_reward_tasks', 'user_reward_tasks_admin_write'],
];

for (const [tableName, policyName] of writePolicies) {
  assert.match(
    migration,
    new RegExp(`drop policy if exists "${policyName}" on public\\.${tableName};`, 'i'),
    `${policyName} old FOR ALL policy must be dropped`,
  );

  for (const action of ['insert', 'update', 'delete']) {
    assert.match(
      migration,
      new RegExp(`create policy "${policyName}_${action}" on public\\.${tableName} for ${action} to authenticated`, 'i'),
      `${policyName}_${action} must be created as an authenticated write-only policy`,
    );
  }
}

assert.doesNotMatch(
  migration,
  /create policy "[^"]+" on public\.[\w_]+ for all/i,
  'no new FOR ALL policy must be created',
);

assert.match(
  migration,
  /alter policy "fansub_members_select_public" on public\.fansub_members to anon, authenticated using \(true\);/i,
  'the real public select policy must stay open to anon and authenticated roles',
);

assert.match(
  migration,
  /alter policy "user_premium_grants_select_own_or_admin" on public\.user_premium_grants to authenticated/i,
  'the user-specific premium grant policy must be authenticated instead of the public role',
);

console.log('PASS Supabase PUBLIC FOR ALL policy split contract kept');
