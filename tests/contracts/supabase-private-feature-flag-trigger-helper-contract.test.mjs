import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260526235902_private_feature_flag_trigger_helpers.sql',
  'utf8',
)

assert.match(
  migration,
  /create or replace function app_private\.is_feature_enabled\(/i,
  'Feature flag helper public RPC grant yerine app_private semasinda bulunmali',
)

assert.match(
  migration,
  /grant execute on function app_private\.is_feature_enabled\(text, boolean\) to anon, authenticated, service_role;/i,
  'trigger/RLS contexts must be able to run the app_private feature flag helper',
)

for (const functionName of [
  'set_feature_flag_updated_by',
  'enforce_reports_feature_flag',
  'enforce_community_posting_feature_flag',
  'enforce_reader_comments_feature_flag',
]) {
  assert.match(
    migration,
    new RegExp(`create or replace function public\\.${functionName}\\(`, 'i'),
    `${functionName} must be rewritten to use the app_private helper instead of the public one`,
  )
}

assert.doesNotMatch(
  migration,
  /public\.is_feature_enabled\('(?:moderation\.reports|community\.posting|reader\.comments)'/i,
  'Runtime guard triggerlari public.is_feature_enabled cagirmamali',
)

assert.doesNotMatch(
  migration,
  /v_actor_id := public\.current_public_user_id\(\);/i,
  'Feature flag updated_by triggeri public.current_public_user_id cagirmamali',
)

assert.match(
  migration,
  /revoke execute on function public\.is_feature_enabled\(text, boolean\) from anon, authenticated, public;/i,
  'the public helper RPC surface must be closed again after moving the trigger',
)

console.log('PASS Supabase private feature flag trigger helper contract kept')
