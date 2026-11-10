import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260520235922_live_release_schedule_and_session_claim_hotfix.sql',
  'utf8',
)

assert.match(
  migration,
  /create or replace function public\.list_public_release_schedule\(/i,
  'the release schedule RPC must be redefined in the hotfix',
)

assert.match(
  migration,
  /security invoker/i,
  'the release schedule must stay SECURITY INVOKER as a public read RPC',
)

assert.match(
  migration,
  /app_private\.chapter_public_unlock_at\(c\.publish_at\)/i,
  'Yayin takvimi public helper grant yerine app_private unlock helper kullanmali',
)

assert.doesNotMatch(
  migration,
  /public\.chapter_public_unlock_at\(c\.publish_at\)/i,
  'Yayin takvimi public direct helper cagrisina donmemeli',
)

assert.match(
  migration,
  /current_setting\('app\.claim_active_session_update', true\) = 'true'/i,
  'session claim must be recognized in the sensitive users trigger with a transaction-local flag',
)

assert.match(
  migration,
  /old\.auth_user_id is distinct from auth\.uid\(\)/i,
  'the session claim flag must only allow the row of its own auth user',
)

assert.match(
  migration,
  /to_jsonb\(new\) - 'active_session_id' - 'active_session_claimed_at' - 'updated_at'/i,
  'the session claim flag must only change session fields',
)

const allowlistBlock = migration.match(/v_allow_sensitive := \([\s\S]*?\n {2}\);/i)?.[0] ?? ''

assert.doesNotMatch(
  allowlistBlock,
  /claim_active_session/i,
  'claim_active_session genis trigger allowlist yerine dar transaction flag kullanmali',
)

for (const sensitiveColumn of [
  'frame_type',
  'background_type',
  'active_profile_effect_id',
  'active_badge_id',
]) {
  assert.match(
    migration,
    new RegExp(`if new\\.${sensitiveColumn} is distinct from old\\.${sensitiveColumn}`, 'i'),
    `${sensitiveColumn} must stay closed in a direct profile update`,
  )
}

assert.match(
  migration,
  /perform set_config\('app\.claim_active_session_update', 'true', true\);[\s\S]*update public\.users[\s\S]*active_session_id = p_session_id/i,
  'claim_active_session users update oncesi transaction-local flag set etmeli',
)

assert.match(
  migration,
  /select u\.active_session_id[\s\S]*for update;[\s\S]*if not found then[\s\S]*Kullanici profili bulunamadi[\s\S]*perform set_config\('app\.claim_active_session_update', 'true', true\);/i,
  'claim_active_session must stop before setting the flag if there is no profile',
)

assert.match(
  migration,
  /grant execute on function public\.claim_active_session\(uuid\) to authenticated;/i,
  'claim_active_session must be callable only by the authenticated role',
)

console.log('PASS Supabase live release schedule and session claim hotfix contract kept')
