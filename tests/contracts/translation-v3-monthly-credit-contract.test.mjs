import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { errorResponse, HttpError } from '../../functions/_shared/translation-http.js'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// --- DB: monthly credits from real API cost, boost tiers, site admin unlimited -----------------
const migration = read('supabase/migrations/20261123100000_translation_studio_monthly_credits.sql')
assert.match(migration, /select pg_catalog\.ceil\(coalesce\(sum\(j\.cost_usd\), 0\) \/ app_private\.tl_credit_usd\(\)\)::integer/,
  'credits follow the recorded cost of each job')
assert.match(migration, /and j\.created_at >= app_private\.tl_month_start\(\)\s+and j\.task <> 'translate_reader';/,
  'the month resets on the 1st; reader translations are not charged to the team')
assert.match(migration, /date_trunc\('month', pg_catalog\.now\(\) at time zone 'Europe\/Istanbul'\) at time zone 'Europe\/Istanbul'/, 'the month follows Turkey time')
assert.match(migration, /case least\(p_tier, 3\) when 1 then 1000 when 2 then 2500 else 6000 end/, 'tier credits 1000 / 2500 / 6000')
assert.match(migration, /case when v\.value ~ '\^\[0-9\]\{1,7\}\$' then v\.value::integer end/, 'a bad metadata value falls back instead of breaking AI')
assert.match(migration, /\(select q\.monthly_credit_limit from public\.translation_fansub_quotas q where q\.fansub_id = p_fansub_id\),\s*app_private\.tl_tier_credits\(app_private\.tl_fansub_tier\(p_fansub_id\)\)/,
  'a manual monthly limit overrides the tier')
assert.match(migration, /if v_used >= v_limit and not app_private\.is_admin\(\) then/, 'site admins are never limited')
assert.match(migration, /if v_fansub is null or not app_private\.tl_can_fansub\(v_fansub\) then/, 'credit only for those with studio access')
assert.match(migration, /function public\.tl_set_fansub_credit_limit[\s\S]{0,300}if not app_private\.is_admin\(\) then/, 'only the site admin sets a team limit')
assert.match(migration, /drop function if exists public\.tl_set_fansub_daily_limit\(uuid, integer\);/, 'page limits are gone')
assert.match(migration, /revoke all on function app_private\.tl_month_credits_used\(uuid\) from public, anon;/)

// --- Worker: the credit is asked before anything goes to the AI ---------------------------------
const http = read('functions/_shared/translation-http.js')
assert.match(http, /db\.rpc\('tl_claim_ai_page', \{ p_page_id: pageId \}\)/)
for (const [worker, arg] of [['scan.js', 'pageId'], ['translate.js', 'pageId'], ['reread.js', 'page.id']]) {
  const source = read(`functions/api/ceviri/${worker}`)
  const call = `await requireAiPageQuota(db, ${arg})`
  assert.ok(source.includes(call), `${worker}: credit check`)
  assert.ok(source.indexOf('requireAiAllowed(db, project.id)') < source.indexOf(call), `${worker}: +18 check first (no credit used on a +18 series)`)
  assert.ok(source.indexOf(call) < source.indexOf('runRoutes('), `${worker}: credit before the model call`)
}
const limited = errorResponse(new HttpError(429, 'bitti', {}, 'credit_limit'))
assert.equal(limited.status, 429)
assert.equal((await limited.json()).code, 'credit_limit', 'the client tells it apart from per-minute busy (not provider_busy)')

// --- UI -------------------------------------------------------------------------------------------
assert.match(read('src/pages/translationStudio/studioErrors.ts'), /credit_limit: \{[\s\S]{0,300}retryable: false/, 'no retry suggested when credits are used up')
const scan = read('src/pages/translationStudio/StepScan.tsx')
assert.match(scan, /'ai_disabled_mature', 'credit_limit'\]\.includes\(info\.code\)\) haltRef\.current = info/, 'the queue stops when credits run out')
assert.match(scan, /data-testid='tl-scan-quota'/, 'remaining credits show before scanning')
assert.match(scan, /remaining !== null && remaining < neededCredits/, 'warned up front if credits will not be enough')
assert.match(read('src/services/translationStudioService.ts'), /supabase\.rpc\('tl_ai_usage_today', \{ p_fansub_id: fansubId \}\)/)
const bar = read('src/pages/translationStudio/StudioLimitBar.tsx')
assert.match(bar, /txa\('\{v1\} \/ \{v2\} kredi', \{ v1: credits\(status\.used\), v2: credits\(status\.limit\) \}\)/, 'the bar counts credits')

console.log('PASS translation studio monthly AI credits (DB, worker order, error code, UI)')
