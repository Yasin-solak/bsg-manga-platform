/**
 * SECURITY DEFINER functions in the public schema must not stay callable by signed-out
 * visitors through the built-in PUBLIC execute grant.
 *
 * Pinned decisions:
 * 1. The default is closed at the ROLE level. A per-schema "alter default privileges ... revoke
 *    ... from public" cannot remove PostgreSQL's built-in PUBLIC execute (migration 198 tried
 *    exactly that and it did nothing), so the statement must not carry "in schema".
 * 2. The 25 functions that were left open are swept by name, with signatures resolved from the
 *    catalog, and the migration fails if anon can still execute one of them.
 * 3. This migration never opens anything: no grant to anon or public.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20261124100000_revoke_public_execute_on_definer_functions.sql',
  'utf8',
)
const statements = migration
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

assert.match(
  statements,
  /alter default privileges for role postgres revoke execute on functions from public;/i,
  'the built-in PUBLIC execute default must be revoked at the role level',
)
assert.doesNotMatch(
  statements,
  /alter default privileges[^;]*in schema[^;]*;/i,
  'a per-schema default cannot revoke the built-in PUBLIC grant; keep the role-level form',
)

const sweptFunctions = [
  'admin_delete_event_quest',
  'admin_delete_quest_event',
  'admin_list_event_quests',
  'admin_list_quest_events',
  'admin_remove_reported_content',
  'admin_set_event_quest_active',
  'admin_upsert_event_quest',
  'admin_upsert_quest_event',
  'claim_quest',
  'cleanup_my_expired_premium_profile_state',
  'fansub_fix_reported_chapter',
  'fansub_submit_content_fix',
  'get_fansub_manage_overview_cockpit',
  'get_fansub_supporter_asset_usage',
  'list_active_events',
  'list_fansub_reported_content',
  'list_quests',
  'send_fansub_special_notification',
  'upsert_fansub_profile',
  'close_fansub_fix_on_chapter_reapprove',
  'close_fansub_fix_on_manga_reapprove',
  'close_fansub_fix_on_post_reapprove',
  'tg_quest_manga_comment',
  'tg_quest_manga_rating',
  'tg_quest_reading_history',
]

const listedNames = [...statements.matchAll(/^\s*'([a-z_]+)',?\s*$/gm)].map((match) => match[1])
assert.deepEqual(
  [...listedNames].sort(),
  [...sweptFunctions].sort(),
  'the sweep must cover exactly the functions that were anon-callable through PUBLIC alone',
)

assert.match(
  statements,
  /revoke execute on function public\.%I\(%s\) from public, anon/i,
  'each swept function must lose both the PUBLIC and the anon execute grant',
)
assert.match(
  statements,
  /pg_get_function_identity_arguments\(p\.oid\)/i,
  'signatures must come from the catalog so an overload cannot be left behind',
)
assert.match(
  statements,
  /if has_function_privilege\('anon', target\.oid, 'EXECUTE'\) then\s+raise exception/i,
  'the migration must fail when anon can still execute a swept function',
)
assert.doesNotMatch(
  statements,
  /grant\s+execute[^;]*\bto\b[^;]*\b(anon|public)\b/i,
  'this migration must not open any function to signed-out visitors',
)

console.log('PASS Supabase definer public execute revoke contract kept')
