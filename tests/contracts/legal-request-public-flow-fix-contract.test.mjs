/**
 * Legal request public flow fix contract (migration 272).
 *
 * Intent: the DMCA/legal request form must work for an ANONYMOUS rights holder. Policy
 * expressions run with the caller's rights, so only helpers open to client roles can be used
 * (app_private.*, rule 208). When a new request arrives admins
 * get a notification; a notification error does not block the request.
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const migrationSource = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260709235902_legal_request_public_flow_fix.sql'),
  'utf8',
)

assert.match(
  migrationSource,
  /app_private\.can_manage_moderation_state\(\)/,
  'the insert policy must do the moderation check with an app_private helper',
)
assert.match(
  migrationSource,
  /submitter_user_id = app_private\.current_public_user_id\(\)/,
  'the insert policy must read identity with an app_private helper',
)
const policyBlock = migrationSource.slice(
  migrationSource.indexOf('create policy legal_requests_insert_public'),
  migrationSource.indexOf('-- ---------- 2)'),
)
assert.doesNotMatch(
  policyBlock,
  /public\.can_manage_moderation_state|public\.current_public_user_id/,
  'the policy must not call public.* helpers closed to client roles (yields permission denied live)',
)
assert.match(
  migrationSource,
  /grant execute on function public\.default_legal_request_priority\(text\) to anon, authenticated/,
  'the priority function must be executable for anon+authenticated (called in a policy)',
)
assert.match(
  migrationSource,
  /create trigger trg_legal_requests_notify_admins/,
  'a new legal request must trigger a notification to admins',
)
assert.match(
  migrationSource,
  /'legal_request_new'/,
  'the notification must carry the push allowlist event (DMCA -> admin push)',
)
assert.match(
  migrationSource,
  /exception when others then[\s\S]*?return new/,
  'a notification error must not block saving the legal request',
)

console.log('PASS legal request public flow repair contract kept')
