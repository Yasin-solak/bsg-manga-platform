import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function run(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

run('auth runtime hardening migration sets the session guard and batch rpc barriers', () => {
  const migrationSource = read('supabase/migrations/20260322235901_auth_runtime_cost_hardening.sql')

  assert.match(migrationSource, /create or replace function public\.get_my_session_guard_state\(p_session_id uuid\)/)
  assert.match(migrationSource, /create or replace function public\.list_my_community_post_like_states\(p_post_ids uuid\[\]\)/)
  assert.match(migrationSource, /create or replace function public\.get_popular_community_tags\(/)
  assert.match(migrationSource, /grant execute on function public\.get_popular_community_tags\(integer, integer\) to anon, authenticated;/)
  assert.doesNotMatch(migrationSource, /'active_session_id'/)
  assert.doesNotMatch(migrationSource, /'active_session_claimed_at'/)
})

run('auth payload hardening migration moves the economy snapshot out of bootstrap', () => {
  const migrationSource = read('supabase/migrations/20260323235901_auth_payload_and_storage_hardening.sql')
  const authProfileSection = migrationSource.match(
    /create or replace function public\.get_auth_user_profile\(p_auth_user_id uuid\)[\s\S]*?\$\$;/,
  )?.[0] ?? ''

  assert.match(migrationSource, /create or replace function public\.get_auth_user_profile\(p_auth_user_id uuid\)/)
  assert.match(migrationSource, /create or replace function public\.get_my_account_runtime_snapshot\(\)/)
  assert.doesNotMatch(authProfileSection, /'stones'/)
  assert.doesNotMatch(authProfileSection, /'owned_items'/)
  assert.match(migrationSource, /grant execute on function public\.get_my_account_runtime_snapshot\(\) to authenticated;/)
})

run('auth bootstrap minimization migration moves auth identity and runtime cosmetics out of bootstrap', () => {
  const migrationSource = read('supabase/migrations/20260323235902_auth_bootstrap_projection_minimization.sql')
  const authProfileSection = migrationSource.match(
    /create or replace function public\.get_auth_user_profile\(p_auth_user_id uuid\)[\s\S]*?\$\$;/,
  )?.[0] ?? ''
  const runtimeSection = migrationSource.match(
    /create or replace function public\.get_my_account_runtime_snapshot\(\)[\s\S]*?\$\$;/,
  )?.[0] ?? ''

  assert.doesNotMatch(authProfileSection, /'auth_user_id'/)
  assert.doesNotMatch(authProfileSection, /'frame_type'/)
  assert.doesNotMatch(authProfileSection, /'active_badge_id'/)
  assert.doesNotMatch(authProfileSection, /'active_profile_effect_id'/)
  assert.doesNotMatch(authProfileSection, /'premium_expires_at'/)
  assert.match(runtimeSection, /'frame_type'/)
  assert.match(runtimeSection, /'active_badge_id'/)
  assert.match(runtimeSection, /'active_profile_effect_id'/)
  assert.match(runtimeSection, /'premium_expires_at'/)
})

run('live audit hardening migration closes the public premium leak and bootstrap ban details', () => {
  const migrationSource = read('supabase/migrations/20260328235901_live_audit_security_and_fansubs_hardening.sql')
  const publicProfileSection = migrationSource.match(
    /create or replace function public\.get_public_user_profile_by_id\(.*?\)[\s\S]*?\$\$;/,
  )?.[0] ?? ''
  const publicUsernameSection = migrationSource.match(
    /create or replace function public\.get_public_user_profile_by_username\(.*?\)[\s\S]*?\$\$;/,
  )?.[0] ?? ''
  const authProfileSection = migrationSource.match(
    /create or replace function public\.get_auth_user_profile\(p_auth_user_id uuid\)[\s\S]*?\$\$;/,
  )?.[0] ?? ''

  assert.doesNotMatch(publicProfileSection, /'premium_expires_at'/)
  assert.doesNotMatch(publicUsernameSection, /'premium_expires_at'/)
  assert.doesNotMatch(authProfileSection, /'ban_reason'/)
  assert.doesNotMatch(authProfileSection, /'banned_by'/)
  assert.doesNotMatch(authProfileSection, /'banned_at'/)
  assert.match(authProfileSection, /'ban_until'/)
})

run('self account economy minimization migration splits auth runtime and the economy snapshot', () => {
  const migrationSource = read('supabase/migrations/20260329235901_self_account_economy_snapshot_minimization.sql')
  const runtimeSection = migrationSource.match(
    /create or replace function public\.get_my_account_runtime_snapshot\(\)[\s\S]*?\$\$;/,
  )?.[0] ?? ''
  const economySection = migrationSource.match(
    /create or replace function public\.get_my_account_economy_snapshot\(\)[\s\S]*?\$\$;/,
  )?.[0] ?? ''

  assert.doesNotMatch(runtimeSection, /'stones'/)
  assert.doesNotMatch(runtimeSection, /'owned_items'/)
  assert.doesNotMatch(runtimeSection, /'premium_expires_at'/)
  assert.match(runtimeSection, /'frame_type'/)
  assert.match(runtimeSection, /'active_badge_id'/)
  assert.match(runtimeSection, /'active_profile_effect_id'/)
  assert.match(economySection, /'stones'/)
  assert.match(economySection, /'owned_items'/)
  assert.match(economySection, /'premium_expires_at'/)
  assert.match(migrationSource, /grant execute on function public\.get_my_account_economy_snapshot\(\) to authenticated;/)
})

run('auth bootstrap and session guard code carry no active session id', () => {
  const authTypesSource = read('src/services/authService/types.ts')
  const authSharedSource = read('src/services/authService/shared.ts')
  const authSessionSource = read('src/services/authService/session.ts')
  const authRuntimeSource = read('src/services/authService/runtime.ts')
  const selfAccountEconomySource = read('src/services/selfAccountEconomyService.ts')
  const supabaseSource = read('src/services/supabase.ts')
  const authPageSource = read('src/pages/AuthPage.tsx')

  assert.doesNotMatch(authTypesSource, /activeSessionId/)
  assert.doesNotMatch(authTypesSource, /activeSessionClaimedAt/)
  assert.match(authSharedSource, /type SessionGuardState = 'match' \| 'missing' \| 'replaced' \| 'unsupported'/)
  assert.match(authSharedSource, /supabase\.rpc\('get_my_session_guard_state'/)
  assert.doesNotMatch(authSharedSource, /activeSessionId/)
  assert.match(authRuntimeSource, /supabase\.rpc\('get_my_account_runtime_snapshot'/)
  assert.doesNotMatch(authRuntimeSource, /ownedItems:/)
  assert.doesNotMatch(authRuntimeSource, /premiumExpiresAt:/)
  assert.match(authRuntimeSource, /hydrateAppUserAccountRuntime/)
  assert.match(selfAccountEconomySource, /supabase\.rpc\('get_my_account_economy_snapshot'/)
  assert.match(selfAccountEconomySource, /clearMyAccountEconomySnapshotCache/)
  assert.match(authSessionSource, /const sessionGuardState = await ensureExpectedSession\(sessionId\)/)
  assert.match(authSessionSource, /if \(sessionGuardState === 'missing' && sessionId\)/)
  assert.match(supabaseSource, /window\.sessionStorage/)
  assert.match(supabaseSource, /window\.localStorage/)
  assert.match(supabaseSource, /getPreferredAuthPersistenceMode/)
  assert.match(supabaseSource, /setPreferredAuthPersistenceMode/)
  assert.match(supabaseSource, /const authStorage = resolveAuthStorage\(\)/)
  assert.match(supabaseSource, /storage: authStorage/)
  assert.match(supabaseSource, /hasSupabaseAuthEntries/)
  assert.doesNotMatch(supabaseSource, /if \(!storage\) return 'local'/)
  assert.doesNotMatch(supabaseSource, /AUTH_PERSISTENCE_MODE_STORAGE_KEY\) \|\| 'local'/)
  /*
   * What the guard protects is ASKING THE USER ABOUT THE PERSISTENT SESSION CHOICE.
   * The text changed when moving to the prototype ("Remember this device" -> "Remember me");
   * the assertion is tied to the CONTROL, not the text, otherwise it would be a pin that goes red on
   * every word change while protecting no behavior. What matters: the box exists, is bound to
   * state and is used on sign-in.
   */
  assert.match(authPageSource, /id="auth-remember-device"/)
  assert.match(authPageSource, /checked=\{rememberAcrossBrowserRestart\}/)
  assert.match(authPageSource, /setRememberAcrossBrowserRestart\(event\.target\.checked\)/)
  assert.match(authPageSource, /persistAcrossBrowserRestart: rememberAcrossBrowserRestart/)
  assert.match(authPageSource, /persistAcrossBrowserRestart/)
})

run('self identity helper skips the auth getUser call and uses cache and missing-session tolerance', () => {
  const source = read('src/services/userService/selfIdentity.ts')

  assert.doesNotMatch(source, /supabase\.auth\.getUser\(/)
  assert.match(source, /SELF_IDENTITY_CACHE_TTL_MS = 4_000/)
  assert.match(source, /currentUserIdentityInFlight/)
  assert.match(source, /clearCurrentUserIdentityCache/)
  assert.match(source, /isCurrentUserIdentityMissingError/)
})

run('feature flag servisi in-flight dedupe uygular', () => {
  const source = read('src/services/featureFlagService.ts')

  assert.match(source, /const featureFlagInFlight = new Map<string, Promise<boolean>>\(\)/)
  assert.match(source, /const inFlight = featureFlagInFlight\.get\(key\)/)
  assert.match(source, /featureFlagInFlight\.set\(key, request\)/)
})

run('the manga detail page makes no direct auth getUser or auth->profile lookup', () => {
  const source = read('src/pages/MangaDetailPage.tsx')

  assert.match(source, /const \{ currentUser \} = useAuth\(\)/)
  assert.doesNotMatch(source, /supabase\.auth\.getUser\(/)
  assert.doesNotMatch(source, /getProfileByAuthId/)
  assert.match(source, /currentUserAvatar=\{currentUser\?\.avatar\}/)
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
