/**
 * Manga recommendation engine contract (V1, rule based).
 *
 * Pins:
 * 1) Migration 271 RPC: security definer + app_private helper (rule 208:
 * public.current_public_user_id is closed to client roles) + anon/auth
 * execute grant + DROPPING read/followed manga.
 * 2) The flag seed DOES NOT overwrite is_enabled on conflict (the admin decision is kept).
 * 3) recommendationService conventions: flag gate, withServiceTimeout,
 * user-facing error, an EMPTY list on error (does not take down the home page).
 * 4) HomePage: the real engine has priority, the heuristic fallback is kept; the rail
 * renders only for signed-in users with enough recommendations.
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const readSource = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

// ---------- 1) Migration / RPC ----------

const migrationSource = readSource('supabase/migrations/20260709235901_manga_recommendations_rpc.sql')
assert.match(migrationSource, /create or replace function public\.get_recommended_mangas/, 'oneri RPC tanimlanmalidir')
assert.match(migrationSource, /security definer/, 'the suggestion RPC must be definer (reads personal tables)')
assert.match(
  migrationSource,
  /app_private\.current_public_user_id\(\)/,
  'identity must be read with the app_private wrapper (public.* closed to client roles, migration 208)',
)
assert.doesNotMatch(
  migrationSource,
  /public\.current_public_user_id\(\)/,
  'public.current_public_user_id must not be used (yields permission denied in client context)',
)
assert.match(
  migrationSource,
  /not exists \(select 1 from excluded e where e\.manga_id = m\.id\)/,
  'read/followed mangas must be eliminated from the candidate pool',
)
assert.match(
  migrationSource,
  /grant execute on function public\.get_recommended_mangas\(integer\) to anon, authenticated/,
  'the RPC must be open to anon (popular fallback) and authenticated',
)
const flagConflictClause = migrationSource.slice(migrationSource.lastIndexOf('on conflict (key) do update'))
assert.doesNotMatch(
  flagConflictClause,
  /is_enabled\s*=\s*excluded\.is_enabled/,
  'flag seed on-conflict is_enabled EZMEMELIDIR (admin runtime karari korunur)',
)

// ---------- 2) Servis konvansiyonlari ----------

const serviceSource = readSource('src/services/recommendationService.ts')
assert.match(serviceSource, /'home\.recommendations'/, 'the service must use a feature flag gate')
assert.match(serviceSource, /withServiceTimeout/, 'the service must wrap the RPC call with withServiceTimeout')
assert.match(serviceSource, /toUserFacingErrorMessage/, 'the service must convert errors to a user-facing message')
assert.match(
  serviceSource,
  /catch[\s\S]*?return \[\]/,
  'the service must return an empty list on error: the suggestion rail never takes the home page down',
)

// ---------- 3) HomePage kablolamasi ----------

const homeSource = readSource('src/pages/HomePage.tsx')
assert.match(homeSource, /getRecommendedMangas\(LIMITS\.recommended\)/, 'HomePage gercek oneri motorunu cagirmalidir')
assert.ok(homeSource.includes('setRecommendationReasons(rows)'), 'real suggestion reasons must be kept')
assert.match(
  homeSource,
  /currentUser && recommendedManga\.length >= 4[\s\S]{0,80}<HomeRecommendedRail/,
  'the rail must render only for signed-in users with enough suggestions',
)

const railSource = readSource('src/components/home/HomeRecommendedRail.tsx')
assert.match(railSource, /data-testid="home-recommended-rail"/, 'ray test kimligi tasimalidir')
assert.match(railSource, /DesktopCover/, 'the desktop suggestion section must use the shared safe cover component')

console.log('PASS manga suggestion engine contract kept')
