import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  const absolutePath = path.join(rootDir, relativePath)
  assert.equal(existsSync(absolutePath), true, `${relativePath} bulunamadi`)
  return readFileSync(absolutePath, 'utf8')
}

const trustAndPresence = readSource(
  'supabase/migrations/20260715130418_admin_user_management_trust_and_presence.sql',
)
const readModel = readSource(
  'supabase/migrations/20260715130421_admin_user_management_read_model.sql',
)
const mutations = readSource(
  'supabase/migrations/20260715130423_admin_user_management_mutations.sql',
)
const authorityHardening = readSource(
  'supabase/migrations/20260715130424_admin_user_management_authority_hardening.sql',
)
const indexes = readSource(
  'supabase/migrations/20260715130426_admin_user_management_indexes.sql',
)
const insertDeleteHardening = readSource(
  'supabase/migrations/20260715130427_admin_user_management_insert_delete_hardening.sql',
)
const authProfileBootstrap = readSource(
  'supabase/migrations/20260207235906_auth_profiles_and_username_rules.sql',
)
const authShared = readSource('src/services/authService/shared.ts')

for (const [name, source] of [
  ['guven ve presence', trustAndPresence],
  ['read model', readModel],
  ['mutasyon', mutations],
  ['authority hardening', authorityHardening],
]) {
  assert.ok(source.split(/\r?\n/).length < 750, `${name} migration file must stay under 750 lines`)
  assert.match(source, /security definer\s+set search_path = ''/i)
}
assert.ok(indexes.split(/\r?\n/).length < 100, 'the index migration file must stay under 100 lines')
assert.ok(
  insertDeleteHardening.split(/\r?\n/).length < 150,
  'the INSERT/DELETE hardening migration file must stay under 150 lines',
)
assert.match(insertDeleteHardening, /^\s*--[\s\S]*?begin;/i)
assert.match(insertDeleteHardening, /notify pgrst, 'reload schema';\s*commit;\s*$/i)

assert.match(trustAndPresence, /function app_private\.get_admin_user_trust_v1\(/i)
assert.match(trustAndPresence, /'trust-v1\.0'::text as algorithm_version/i)
assert.match(trustAndPresence, /60\s+\+ w\.verification_points\s+\+ w\.tenure_points/i)
assert.match(trustAndPresence, /when b\.is_verified then 10 else 0/i)
assert.match(trustAndPresence, /when b\.account_age_days >= 180 then 15/i)
assert.match(trustAndPresence, /when b\.account_age_days >= 90 then 15/i)
assert.match(trustAndPresence, /when se\.created_at >= p_as_of - interval '30 days' then 20/i)
assert.match(trustAndPresence, /se\.event_type = 'user_banned'/i)
assert.match(trustAndPresence, /'ACTIVE_BAN'/)
assert.match(trustAndPresence, /u\.ban_until is null or u\.ban_until > p_as_of/i)
assert.doesNotMatch(
  trustAndPresence,
  /redeem_velocity|redeem_failure|from public\.reports/i,
  'Guven skoru kesinlesmemis davranis sinyallerini kullanmamali',
)

assert.match(trustAndPresence, /function app_private\.touch_my_presence\(\s*\)/i)
assert.match(
  trustAndPresence,
  /function app_private\.record_auth_session_context\(\s*p_session_id uuid,\s*p_device_id text default null,\s*p_device_label text default null,\s*p_platform text default null,\s*p_browser text default null,\s*p_user_agent text default null\s*\)/i,
  'parameter defaults of the existing session context function must not be removed',
)
assert.doesNotMatch(
  trustAndPresence,
  /function app_private\.touch_my_presence\([\s\S]*?p_as_of timestamptz[\s\S]*?\)\s*returns jsonb/i,
  'the presence helper must not accept time from the client',
)
assert.doesNotMatch(
  trustAndPresence,
  /function app_private\.record_auth_session_context\([\s\S]*?p_as_of timestamptz[\s\S]*?\)\s*returns void/i,
  'the session context helper must not accept time from the client',
)
assert.ok(
  (trustAndPresence.match(/v_as_of timestamptz := pg_catalog\.statement_timestamp\(\)/gi) || []).length >= 2,
  'presence and session context time must be produced only on the server',
)
assert.match(trustAndPresence, /u\.active_session_id = v_session_id/i)
assert.match(trustAndPresence, /p_session_id is distinct from v_claim_session_id/i)
assert.match(trustAndPresence, /v_revoked_at is not null/i)
assert.match(trustAndPresence, /v_last_seen_at < v_as_of - interval '45 seconds'/i)
assert.match(trustAndPresence, /function public\.touch_my_presence\(\)[\s\S]*?security invoker/i)

assert.match(readModel, /function public\.get_admin_user_management_overview\(\)/i)
assert.match(readModel, /function public\.list_admin_user_management_page\(\s*p_limit integer default 40,[\s\S]*?p_cursor_user_id uuid default null\s*\)/i)
assert.match(readModel, /function public\.get_admin_user_management_preview\(\s*p_user_id uuid\s*\)/i)
assert.ok(
  (readModel.match(/security invoker\s+set search_path = ''/gi) || []).length >= 3,
  'Public read wrapperlari invoker standardini korumali',
)
assert.match(readModel, /limit v_limit \+ 1/i)
assert.match(readModel, /\(c\.created_at, c\.id\) < \(p_cursor_created_at, p_cursor_user_id\)/i)
const candidatesStart = readModel.indexOf('candidates as materialized')
const itemRowsStart = readModel.indexOf('item_rows as materialized')
assert.ok(candidatesStart >= 0 && itemRowsStart > candidatesStart, 'Liste enrichment CTE sinirlari bulunmali')
assert.doesNotMatch(
  readModel.slice(candidatesStart, itemRowsStart),
  /public\.(?:activity_events|auth_session_events)/i,
  'presence and activity enrichment must run only on the trimmed page, not all candidates',
)
assert.match(readModel, /'items'/)
assert.match(readModel, /'total'/)
assert.match(readModel, /'hasNext'/)
assert.match(readModel, /'nextCursor'/)
assert.match(readModel, /'lastActivityAt'/)
assert.doesNotMatch(readModel, /'lastActiveAt'/)
assert.match(readModel, /'updatedAt'/)
assert.match(readModel, /'components', i\.components/i)
assert.match(readModel, /greatest\(presence\.last_seen_at, activity\.last_activity_at\)/i)
assert.match(readModel, /e\.session_id = u\.active_session_id/i)
assert.equal(
  (readModel.match(/actor_type = 'user'/gi) || []).length,
  3,
  'overview, list and preview activity queries must keep the user partial index predicate',
)
assert.equal(
  (readModel.match(/order by e\.created_at desc, e\.event_key desc/gi) || []).length,
  2,
  'list and preview activity order must align with the existing partial index',
)
assert.match(readModel, /when i\.is_banned or not i\.is_active then 'blocked'/i)
assert.match(readModel, /when s\.is_last_available_admin then 'last_admin'/i)
assert.match(readModel, /interval '120 seconds'/i)
assert.match(readModel, /interval '5 minutes'/i)
assert.match(readModel, /v_current_start := p_as_of - interval '7 days'/i)
assert.match(readModel, /v_previous_start := p_as_of - interval '14 days'/i)
assert.match(readModel, /v_previous_end := p_as_of - interval '7 days'/i)
assert.match(readModel, /v_new_start := p_as_of - interval '7 days'/i)
assert.match(readModel, /position\('@' in v_search\)/i)
assert.doesNotMatch(readModel, /'email'\s*,/i, 'E-posta response JSON icine sizmamalidir')

assert.match(mutations, /function public\.set_admin_users_ban_state\(/i)
assert.match(mutations, /pg_catalog\.cardinality\(v_user_ids\) > 100/i)
assert.match(mutations, /Ban nedeni en az 3 karakter olmalidir/i)
assert.match(mutations, /Ban nedeni en fazla 500 karakter olabilir/i)
assert.ok(
  (mutations.match(/bsgmanga:admin-authority-mutation/g) || []).length >= 2,
  'ban and role mutations must use the same authority advisory lock',
)
assert.equal(
  (mutations.match(/Admin yetkisi islem sirasinda degisti\./g) || []).length,
  2,
  'ban and role mutations must revalidate actor permission after the advisory lock',
)
for (const functionName of ['set_admin_users_ban_state', 'set_user_role']) {
  const functionStart = mutations.indexOf(`function app_private.${functionName}(`)
  const functionEnd = mutations.indexOf('$function$;', functionStart)
  const functionBody = mutations.slice(functionStart, functionEnd)
  const advisoryLock = functionBody.indexOf('pg_advisory_xact_lock')
  const actorLock = functionBody.indexOf('where u.id = v_actor_id')
  const authorityRecheck = functionBody.indexOf('Admin yetkisi islem sirasinda degisti.')
  assert.ok(
    functionStart >= 0 && advisoryLock >= 0 && actorLock > advisoryLock && authorityRecheck > actorLock,
    `${functionName} must keep the advisory lock -> actor row lock -> authority recheck order`,
  )
}
const bulkBanStart = mutations.indexOf('function app_private.set_admin_users_ban_state(')
const bulkBanEnd = mutations.indexOf('$function$;', bulkBanStart)
const bulkBanBody = mutations.slice(bulkBanStart, bulkBanEnd)
assert.ok(
  bulkBanBody.indexOf('for update;') >= 0
    && bulkBanBody.indexOf('update public.auth_session_events') > bulkBanBody.indexOf('for update;'),
  'bulk ban must lock user rows first, then session rows',
)
assert.ok(
  (mutations.match(/v_as_of timestamptz := pg_catalog\.statement_timestamp\(\)/gi) || []).length >= 2,
  'mutation time must be produced only on the server',
)
assert.doesNotMatch(
  mutations,
  /function app_private\.set_admin_users_ban_state\([\s\S]*?p_as_of timestamptz[\s\S]*?\)\s*returns jsonb/i,
)
assert.doesNotMatch(
  mutations,
  /function app_private\.set_user_ban_state\([\s\S]*?p_as_of timestamptz[\s\S]*?\)\s*returns table/i,
)
assert.doesNotMatch(
  mutations,
  /function app_private\.set_user_role\([\s\S]*?p_as_of timestamptz[\s\S]*?\)\s*returns table/i,
)
assert.match(mutations, /'requested'/)
assert.match(mutations, /'updated'/)
assert.match(mutations, /'unchanged'/)
assert.match(mutations, /'rejected'/)
assert.match(mutations, /'items'/)
for (const status of ['updated', 'unchanged', 'not_found', 'self_rejected', 'last_admin_rejected']) {
  assert.match(mutations, new RegExp(`'${status}'`))
}
assert.doesNotMatch(mutations, /requestedCount|updatedCount|blockedCount|'results'|blocked_self|blocked_last_admin/i)
assert.match(mutations, /update public\.auth_session_events[\s\S]*?revoked_at/i)
assert.match(mutations, /active_session_id = case[\s\S]*?extensions\.gen_random_uuid\(\)/i)
assert.match(mutations, /'user_banned'/)
assert.match(mutations, /function public\.set_user_ban_state[\s\S]*?security invoker/i)
assert.match(mutations, /function public\.set_user_role[\s\S]*?security invoker/i)
assert.match(
  mutations,
  /function app_private\.set_user_ban_state\(\s*p_user_id uuid,\s*p_is_banned boolean,\s*p_ban_reason text default null,\s*p_ban_until timestamptz default null\s*\)/i,
  'parameter defaults of the existing single ban function must not be removed',
)

assert.match(
  authorityHardening,
  /revoke update on table public\.users from public, anon, authenticated;/i,
)
assert.doesNotMatch(
  authorityHardening,
  /revoke update[^;]*service_role/i,
  'service-role security-definer and maintenance flows must be kept',
)
assert.match(
  authorityHardening,
  /grant update on table public\.users to service_role;/i,
  'Service-role bakim akislari genis users UPDATE yetkisini korumali',
)
assert.match(
  authorityHardening,
  /revoke update \(%s\) on table public\.users from public, anon, authenticated/i,
  'previous all-column UPDATE grants must be cleared for the default-closed model',
)
assert.doesNotMatch(
  authorityHardening,
  /not \(c\.column_name::text = any\(/i,
  'new or non-profile columns must not automatically count as safe',
)
const safeGrantStart = authorityHardening.indexOf('grant update (')
const safeGrantEnd = authorityHardening.indexOf(') on table public.users to authenticated;', safeGrantStart)
const safeGrantBlock = authorityHardening.slice(safeGrantStart, safeGrantEnd)
const safeGrantColumns = safeGrantBlock
  .replace(/grant update \(/i, '')
  .split(',')
  .map((column) => column.trim())
  .filter(Boolean)
assert.deepEqual(
  safeGrantColumns,
  ['avatar_url', 'bio', 'social_links', 'preferred_genres'],
  'the direct users UPDATE allowlist must contain only profile columns required in source',
)
for (const column of safeGrantColumns) {
  assert.match(safeGrantBlock, new RegExp(`\\b${column}\\b`), `${column} self profil UPDATE allowlistinde kalmali`)
}
for (const column of [
  'id',
  'auth_user_id',
  'role',
  'is_banned',
  'ban_reason',
  'ban_until',
  'banned_by',
  'banned_at',
  'is_active',
  'active_session_id',
  'active_session_claimed_at',
  'stones',
  'owned_items',
  'premium_expires_at',
  'frame_type',
  'background_type',
  'active_badge_id',
  'active_profile_effect_id',
  'onboarding_completed_at',
]) {
  assert.doesNotMatch(safeGrantBlock, new RegExp(`\\b${column}\\b`), `${column} direct UPDATE allowlistine girmemeli`)
}
assert.match(
  authorityHardening,
  /function app_private\.revoke_auth_session\([\s\S]*?security definer\s+set search_path = ''/i,
)
assert.match(
  authorityHardening,
  /function app_private\.revoke_auth_session\(\s*p_session_id uuid,\s*p_reason text default null\s*\)/i,
  'the parameter default of the existing session close function must not be removed',
)
assert.match(
  authorityHardening,
  /function public\.revoke_auth_session\([\s\S]*?security invoker\s+set search_path = ''/i,
)
const revokeSessionStart = authorityHardening.indexOf('function app_private.revoke_auth_session(')
const revokeSessionEnd = authorityHardening.indexOf('$function$;', revokeSessionStart)
const revokeSessionBody = authorityHardening.slice(revokeSessionStart, revokeSessionEnd)
assert.ok(
  revokeSessionBody.indexOf('select u.active_session_id') >= 0
    && revokeSessionBody.indexOf('for update;') > revokeSessionBody.indexOf('select u.active_session_id')
    && revokeSessionBody.indexOf('update public.auth_session_events') > revokeSessionBody.indexOf('for update;'),
  'Session revoke user satirini session satirindan once kilitlemeli',
)
assert.match(
  authorityHardening,
  /set_config\('app\.claim_active_session_update', 'true', true\)[\s\S]*?set_config\('app\.claim_active_session_update', '', true\)/i,
  'Dar session flagi users UPDATE sonrasinda temizlenmeli',
)
assert.match(
  authorityHardening,
  /revoke all on function app_private\.revoke_auth_session\(uuid, text\)[\s\S]*?grant execute[\s\S]*?to authenticated/i,
)
assert.match(
  authorityHardening,
  /revoke all on function public\.revoke_auth_session\(uuid, text\)[\s\S]*?grant execute[\s\S]*?to authenticated/i,
)

assert.match(
  insertDeleteHardening,
  /revoke delete on table public\.users from public, anon, authenticated;/i,
  'Dogrudan users DELETE Data API rollerine kapatilmali',
)
assert.match(
  insertDeleteHardening,
  /grant delete on table public\.users to service_role;/i,
  'Service-role bakim akisi users DELETE yetkisini korumali',
)
assert.match(
  insertDeleteHardening,
  /drop policy if exists users_delete_admin on public\.users;/i,
  'the old admin direct DELETE policy surface must be removed',
)
assert.doesNotMatch(
  insertDeleteHardening,
  /create policy users_delete_admin/i,
  'the admin delete policy must not reopen',
)
assert.match(
  insertDeleteHardening,
  /revoke insert on table public\.users from public, anon, authenticated;/i,
  'direct users INSERT table permission must be default closed',
)
assert.match(
  insertDeleteHardening,
  /revoke insert \(%s\) on table public\.users from public, anon, authenticated/i,
  'previous all-column INSERT grants must be cleared before setting the allowlist',
)
assert.match(
  insertDeleteHardening,
  /grant insert on table public\.users to service_role;/i,
  'service-role profile bootstrap and maintenance flows must be kept',
)
const safeInsertGrantStart = insertDeleteHardening.indexOf('grant insert (')
const safeInsertGrantEnd = insertDeleteHardening.indexOf(
  ') on table public.users to authenticated;',
  safeInsertGrantStart,
)
const safeInsertGrantBlock = insertDeleteHardening.slice(safeInsertGrantStart, safeInsertGrantEnd)
const safeInsertColumns = safeInsertGrantBlock
  .replace(/grant insert \(/i, '')
  .split(',')
  .map((column) => column.trim())
  .filter(Boolean)
assert.deepEqual(
  safeInsertColumns,
  ['auth_user_id', 'username', 'username_slug', 'avatar_url', 'role'],
  'the direct users INSERT allowlist must contain only the existing auth fallback contract',
)
const fallbackInsertMatch = authShared.match(
  /\.from\('users'\)\s*\.insert\(\{([\s\S]*?)\}\)\s*\.select\('id'\)/i,
)
assert.ok(fallbackInsertMatch, 'Auth fallback users INSERT payloadi bulunmali')
const fallbackInsertColumns = [...fallbackInsertMatch[1].matchAll(/^\s*([a-z_]+):/gim)].map(
  (match) => match[1],
)
assert.deepEqual(
  fallbackInsertColumns,
  safeInsertColumns,
  'the auth fallback payload and DB INSERT column allowlist must change together',
)
assert.match(fallbackInsertMatch[1], /role:\s*'user'/i, 'the auth fallback must create only the user role')
assert.match(
  authProfileBootstrap,
  /function public\.handle_auth_user_created\(\)[\s\S]*?security definer[\s\S]*?insert into public\.users\s*\(\s*auth_user_id,\s*username,\s*username_slug,\s*avatar_url,\s*role\s*\)[\s\S]*?'user'/i,
  'the normal auth.users trigger bootstrap must also use a fixed user role and narrow payload',
)
for (const column of [
  'id',
  'stones',
  'owned_items',
  'is_banned',
  'is_active',
  'ban_reason',
  'ban_until',
  'banned_by',
  'banned_at',
  'premium_expires_at',
  'active_session_id',
  'active_session_claimed_at',
  'active_badge_id',
  'active_profile_effect_id',
  'onboarding_completed_at',
]) {
  assert.doesNotMatch(
    safeInsertGrantBlock,
    new RegExp(`\\b${column}\\b`),
    `${column} direct INSERT allowlistine girmemeli`,
  )
}
assert.match(
  insertDeleteHardening,
  /create policy users_insert_self[\s\S]*?for insert\s+to authenticated[\s\S]*?\(select auth\.uid\(\)\) = auth_user_id/i,
  'a fallback profile must be created only for the JWT owner auth identity',
)
const bootstrapPolicyStart = insertDeleteHardening.indexOf(
  'create policy users_insert_bootstrap_invariants',
)
const bootstrapPolicyEnd = insertDeleteHardening.indexOf(');', bootstrapPolicyStart)
const bootstrapPolicyBlock = insertDeleteHardening.slice(bootstrapPolicyStart, bootstrapPolicyEnd)
assert.match(
  bootstrapPolicyBlock,
  /as restrictive\s+for insert\s+to authenticated/i,
  'bootstrap invariants must not be bypassable by other permissive policies',
)
for (const invariant of [
  /\(select auth\.uid\(\)\) = auth_user_id/i,
  /role = 'user'/i,
  /is_active = true/i,
  /is_banned = false/i,
  /stones = 0/i,
  /frame_type = 'default'/i,
  /active_badge_id is null/i,
  /ban_reason is null/i,
  /ban_until is null/i,
  /banned_by is null/i,
  /banned_at is null/i,
  /premium_expires_at is null/i,
  /active_session_id is null/i,
  /active_session_claimed_at is null/i,
  /active_profile_effect_id is null/i,
  /onboarding_completed_at is null/i,
  /owned_items -> 'frames'[\s\S]*?\["default"\]/i,
  /owned_items -> 'premium'[\s\S]*?= '\[\]'::jsonb/i,
  /owned_items -> 'profile_effects'[\s\S]*?= '\[\]'::jsonb/i,
]) {
  assert.match(bootstrapPolicyBlock, invariant, `Bootstrap invarianti eksik: ${invariant}`)
}
assert.doesNotMatch(
  insertDeleteHardening,
  /create index concurrently/i,
  'Authority migration transaction icinde CONCURRENTLY kullanmamali',
)

assert.doesNotMatch(indexes, /create index concurrently/i, 'Transaction icinde CONCURRENTLY kullanilmamali')
assert.equal(
  (indexes.match(/create index if not exists/gi) || []).length,
  3,
  'an edge-used and rerunnable admin user management index must exist',
)
assert.match(indexes, /security_events_trust_ban_target_created_idx/)
assert.match(indexes, /users_admin_management_created_id_idx/)
assert.match(indexes, /users_admin_management_role_created_id_idx/)
assert.doesNotMatch(indexes, /auth_session_events_presence_user_seen_idx/)
assert.doesNotMatch(indexes, /users_admin_management_ban_created_id_idx/)

console.log('PASS admin user management database contract kept')
