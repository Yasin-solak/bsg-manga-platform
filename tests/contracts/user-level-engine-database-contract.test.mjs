import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const foundation = readFileSync(
  new URL('../../supabase/migrations/20260718062710_user_level_engine_foundation.sql', import.meta.url),
  'utf8',
)
const questRewards = readFileSync(
  new URL('../../supabase/migrations/20260718062713_user_level_quest_rewards.sql', import.meta.url),
  'utf8',
)
const readModels = readFileSync(
  new URL('../../supabase/migrations/20260718062715_user_level_read_models.sql', import.meta.url),
  'utf8',
)
const rlsHelperFix = readFileSync(
  new URL('../../supabase/migrations/20260729090000_user_level_rls_helper_fix.sql', import.meta.url),
  'utf8',
)

function functionBlock(source, schema, functionName) {
  const block = source.match(new RegExp(
    `create(?: or replace)? function ${schema}\\.${functionName}\\([\\s\\S]*?\\$function\\$;`,
    'i',
  ))?.[0]
  assert.ok(block, `${schema}.${functionName} fonksiyon blogu bulunamadi.`)
  return block
}

const awardFunction = functionBlock(foundation, 'app_private', 'award_user_xp')
const questTrigger = functionBlock(questRewards, 'app_private', 'award_claimed_quest_xp')
const publicProgression = functionBlock(readModels, 'app_private', 'get_public_user_progression')
const adminProgression = functionBlock(readModels, 'app_private', 'get_admin_user_progression')

assert.match(foundation, /create table if not exists public\.user_level_rulesets/i)
assert.match(foundation, /create table if not exists public\.user_level_thresholds/i)
assert.match(foundation, /create table if not exists app_private\.user_xp_events/i)
assert.match(foundation, /event_key text not null unique/i)
assert.match(foundation, /create table if not exists public\.user_level_snapshots/i)
assert.match(foundation, /before update or delete on app_private\.user_xp_events/i)
assert.match(foundation, /XP olay defteri değiştirilemez/i)
assert.doesNotMatch(foundation, /alter table public\.users[\s\S]{0,80}(?:drop|alter) column level/i)

// RLS policies of level tables MUST use app_private wrappers:
// migration 208 took EXECUTE on public.is_admin / public.current_public_user_id
// from client roles, and policy expressions are evaluated with the caller's
// rights. A violation yields "permission denied for function" live
// (see 267->270 and 196->272). No static gate catches this.
for (const policyName of [
  'user_level_rulesets_read',
  'user_level_thresholds_read',
  'user_level_snapshots_read_own_or_admin',
]) {
  assert.match(
    rlsHelperFix,
    new RegExp(`create policy ${policyName}`),
    `${policyName} policy must be rebuilt in the app_private fix`,
  )
}
assert.match(rlsHelperFix, /app_private\.is_admin\(\)/)
assert.match(rlsHelperFix, /user_id = app_private\.current_public_user_id\(\)/)
// Look only at the SQL body: the comment block has to mention public.* names while explaining the root
// cause, they are not violations.
const rlsHelperFixSql = rlsHelperFix.replace(/^\s*--.*$/gm, '')
assert.doesNotMatch(
  rlsHelperFixSql,
  /public\.(is_admin|current_public_user_id)\(\)/,
  'public.* helpers closed to client roles must not be called in policy expressions',
)

assert.match(awardFunction, /security definer[\s\S]*set search_path = ''/i)
assert.match(awardFunction, /where u\.id = p_user_id[\s\S]*for update/i)
assert.match(awardFunction, /where s\.user_id = p_user_id[\s\S]*for update/i)
assert.match(awardFunction, /when p_xp_delta < 0 then greatest\(p_xp_delta, -v_total_xp\)/i)
assert.match(awardFunction, /insert into app_private\.user_xp_events[\s\S]*update public\.user_level_snapshots/i)
assert.match(awardFunction, /p_notify and v_level_number > v_previous_level/i)
assert.match(awardFunction, /public\.push_notification\([\s\S]*'level_up'/i)
assert.match(foundation, /revoke all on function app_private\.award_user_xp\([\s\S]*from public, anon, authenticated/i)
assert.doesNotMatch(foundation, /grant execute on function app_private\.award_user_xp\([\s\S]*to (?:anon|authenticated)/i)

assert.match(questRewards, /add column if not exists xp_reward integer not null default 0/i)
assert.match(questRewards, /when 'profile-ready' then 100/i)
assert.match(questRewards, /when 'post-3-quality' then 250/i)
assert.match(questRewards, /where audience = 'user'/i)
assert.match(questTrigger, /old\.claimed_at is not null[\s\S]*new\.claimed_at is null/i)
assert.match(questTrigger, /q\.slug in \('profile-ready', 'post-3-quality'\)/i)
assert.match(questTrigger, /'quest-claim:' \|\| new\.id::text/i)
assert.match(questRewards, /when \(old\.claimed_at is null and new\.claimed_at is not null\)/i)
assert.deepEqual(
  [...questRewards.matchAll(/when '([^']+)' then \d+/gi)].map((match) => match[1]),
  ['profile-ready', 'post-3-quality'],
  'in the first XP version only two allowed tasks must produce rewards',
)

assert.match(publicProgression, /public\.get_profile_view_access\(p_user_id\)/i)
assert.match(publicProgression, /v_access\.profile_visible/i)
assert.match(publicProgression, /v_access\.stats_visible/i)
assert.match(adminProgression, /app_private\.is_admin\(\)/i)
assert.match(adminProgression, /limit 20/i)
assert.match(readModels, /create or replace function public\.list_admin_user_management_page_v2\([\s\S]*p_limit integer default 10/i)
assert.match(readModels, /app_private\.list_admin_user_management_page\(/i)
assert.match(readModels, /'progression', app_private\.build_user_progression_payload/i)
assert.match(readModels, /security invoker/g)
assert.doesNotMatch(`${foundation}\n${questRewards}\n${readModels}`, /create\s+index\s+concurrently/i)

console.log('PASS server-controlled user level engine database contract kept')
