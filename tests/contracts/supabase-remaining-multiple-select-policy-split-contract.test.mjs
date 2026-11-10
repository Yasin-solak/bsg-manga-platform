import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235906_remaining_multiple_select_policy_split.sql',
  'utf8',
);

const writePolicies = [
  ['fansub_boost_capability_policies', 'fansub_boost_capability_policies_admin_write'],
  ['fansub_identity_badge_catalog', 'fansub_identity_badge_catalog_admin_write'],
  ['fansub_identity_tags', 'fansub_identity_tags_staff_write'],
  ['store_profile_effect_assets', 'store_profile_effect_assets_admin_write'],
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
  /\(select can_manage_moderation_state\(\)\)/,
  'a row-independent moderation helper must be wrapped as an initPlan',
);

assert.match(
  migration,
  /alter policy "fansub_identity_tags_select_public_active" on public\.fansub_identity_tags to anon, authenticated/i,
  'Fansub identity tag public okuma policy rol kapsami korunmali',
);

console.log('PASS Supabase remaining multiple select policy split contract kept');
