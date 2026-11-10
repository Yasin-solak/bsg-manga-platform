import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235904_rls_initplan_policy_optimization.sql',
  'utf8',
);

const expectedPolicies = [
  'auth_session_events_select_own',
  'fansub_reward_rank_rules_select_authenticated',
  'fansub_reward_tasks_select_authenticated',
  'fansub_reward_view_tiers_select_authenticated',
  'reading_streak_reward_rules_select_authenticated',
  'redeem_code_attempts_insert_authenticated',
  'redeem_codes_select_active',
  'user_reward_tasks_select_authenticated',
  'users_insert_self',
];

for (const policyName of expectedPolicies) {
  assert.match(
    migration,
    new RegExp(`alter policy "${policyName}"`, 'i'),
    `${policyName} policy'si migration icinde korunmali`,
  );
}

assert.doesNotMatch(
  migration,
  /using\s*\([^;]*(?<!select\s)auth\.(uid|role|email|jwt)\(\)/i,
  'USING ifadelerinde dogrudan auth.* cagrisi kalmamali',
);

assert.doesNotMatch(
  migration,
  /with check\s*\([^;]*(?<!select\s)auth\.(uid|role|email|jwt)\(\)/i,
  'WITH CHECK ifadelerinde dogrudan auth.* cagrisi kalmamali',
);

assert.match(
  migration,
  /\(select is_admin\(\)\)/,
  'a row-independent is_admin helper call must be wrapped as an initPlan',
);

assert.match(
  migration,
  /with check \(\(\(select auth\.uid\(\)\) is not null\) and \(\(select auth\.uid\(\)\) = auth_user_id\)\)/i,
  'users_insert_self ownership kontrolu davranis esdegeriyle korunmali',
);

console.log('PASS Supabase RLS initPlan policy optimization contract kept');
