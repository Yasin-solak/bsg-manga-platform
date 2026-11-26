import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261122100000_translation_studio_boost_tiers.sql')

// Boost tiers drive the studio: tier 1 unlocks it, each tier raises the daily AI page limit
// (10 pages a day per point of power at the tier floor: 3/6/12 power -> 30/60/120 pages).
assert.match(migration, /case least\(p_tier, 3\) when 1 then 30 when 2 then 60 else 120 end/)
assert.match(migration, /metadata -> 'tier_page_limits'/, 'the per-tier numbers are configurable without a migration')
assert.match(migration, /\(select q\.daily_page_limit from public\.translation_fansub_quotas q where q\.fansub_id = p_fansub_id\),\s*app_private\.tl_tier_page_limit\(app_private\.tl_fansub_tier\(p_fansub_id\)\)/,
  'a manual quota still overrides the tier limit')
assert.match(migration, /select app_private\.tl_fansub_tier\(p_fansub_id\) >= 1\s*or exists \(select 1 from public\.translation_fansub_quotas/, 'tier 1 or a manual quota unlocks the studio')
assert.match(migration, /if tg_op = 'INSERT' and not app_private\.tl_is_service\(\) and not app_private\.is_admin\(\)\s*and not app_private\.tl_fansub_unlocked\(new\.fansub_id\) then/,
  'new chapters cannot be opened in a locked studio (server side)')
assert.match(migration, /grant execute on function public\.tl_studio_status\(uuid\) to authenticated/)
assert.match(migration, /revoke all on function public\.tl_studio_status\(uuid\) from public, anon/)

// The studio shows the lock screen and the limit bar from the same status.
const page = read('src/pages/translationStudio/TranslationStudioPage.tsx')
// A lapsed or locked team keeps its existing work (finish by hand, publish); only new chapters and
// AI are blocked, and the lock follows the live status.
assert.match(page, /const locked = !isSiteAdmin && !isMockFansub && studioStatus !== null && !studioStatus\.unlocked/)
assert.match(page, /const access = project\?\.isMature \|\| locked \? \{ \.\.\.baseAccess, ai: false \} : baseAccess/)
assert.match(page, /canStart=\{access\.project && !locked\}/)
assert.match(page, /\{locked && studioStatus && \(screen === 'seri' \|\| screen === 'bolum'\) && <StudioLockedScreen/)
assert.match(page, /\{gate === 'open' && studioStatus && <StudioLimitBar status=\{studioStatus\} boostHref=\{boostHref\} \/>\}/)
assert.match(migration, /revoke all on function app_private\.tl_fansub_unlocked\(uuid\) from public, anon;\s*grant execute on function app_private\.tl_fansub_unlocked\(uuid\) to authenticated, service_role;/,
  'the invoker guard trigger can call the unlock check; anon cannot')
assert.match(migration, /case when v\.value ~ '\^\[0-9\]\{1,5\}\$' then v\.value::integer end/, 'a bad metadata value falls back instead of breaking AI')
assert.match(migration, /q\.daily_page_limit > 0/, 'a zero quota does not unlock the studio')
const service = read('src/services/translationStudioService.ts')
assert.match(service, /supabase\.rpc\('tl_studio_status', \{ p_fansub_id: fansubId \}\)/)
assert.equal((service.match(/window\.dispatchEvent\(new Event\(TL_AI_USAGE_EVENT\)\)/g) ?? []).length, 2, 'scan and translate refresh the bar')

console.log('PASS translation studio boost tiers: tier 1 unlocks, 30/60/120 pages, manual quota override, limit bar')
