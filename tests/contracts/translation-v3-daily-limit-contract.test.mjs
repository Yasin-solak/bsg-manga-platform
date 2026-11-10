import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { errorResponse, HttpError } from '../../functions/_shared/translation-http.js'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// --- DB: a page counts once a day, fansub limit, site admin unlimited -------------------------
const migration = read('supabase/migrations/20260929145109_translation_studio_v3_daily_page_limit.sql')
assert.match(migration, /primary key \(fansub_id, usage_day, page_id\)/, 'the same page on the same day is one credit')
assert.match(migration, /\(now\(\) at time zone 'Europe\/Istanbul'\)::date/, 'the day follows the Istanbul calendar')
assert.match(migration, /pg_advisory_xact_lock\(hashtext\('tl_ai_usage:' \|\| v_fansub::text\)\)/, 'no limit overrun on concurrent requests')
assert.match(migration, /if v_used >= v_limit and not app_private\.is_admin\(\) then/, 'site admini sinirsiz')
assert.match(migration, /if v_fansub is null or not app_private\.tl_can_fansub\(v_fansub\) then/, 'credit only for those with studio access')
assert.match(migration, /daily_page_limit integer not null check \(daily_page_limit between 0 and 10000\)/)
assert.match(migration, /if not app_private\.is_admin\(\) then\s+raise exception 'Yalnızca site yöneticisi limit ayarlayabilir\.'/, 'only the site admin sets the limit')

// --- Worker: hak, yapay zekaya giden her seyden once istenir ---------------------------------
const http = read('functions/_shared/translation-http.js')
assert.match(http, /db\.rpc\('tl_claim_ai_page', \{ p_page_id: pageId \}\)/)
for (const [worker, arg] of [['scan.js', 'pageId'], ['translate.js', 'pageId'], ['reread.js', 'page.id']]) {
  const source = read(`functions/api/ceviri/${worker}`)
  const call = `await requireAiPageQuota(db, ${arg})`
  assert.ok(source.includes(call), `${worker}: gunluk hak kontrolu`)
  assert.ok(source.indexOf('requireAiAllowed(db, project.id)') < source.indexOf(call), `${worker}: +18 check first (no credit used on a +18 series)`)
  assert.ok(source.indexOf(call) < source.indexOf('runRoutes('), `${worker}: hak model cagrisindan once`)
}
const limited = errorResponse(new HttpError(429, 'doldu', {}, 'daily_limit'))
assert.equal(limited.status, 429)
assert.equal((await limited.json()).code, 'daily_limit', 'the client tells it apart from per-minute busy (not provider_busy)')

// --- Arayuz ---------------------------------------------------------------------------------
assert.match(read('src/pages/translationStudio/studioErrors.ts'), /daily_limit: \{[\s\S]{0,300}retryable: false/, 'no retry suggested when credit is used up')
const scan = read('src/pages/translationStudio/StepScan.tsx')
assert.match(scan, /'ai_disabled_mature', 'daily_limit'\]\.includes\(info\.code\)\) haltRef\.current = info/, 'hak dolunca kuyruk durur')
assert.match(scan, /data-testid='tl-scan-quota'/, 'remaining credit shows before scanning')
assert.match(scan, /remaining !== null && remaining < needed/, 'warned up front if credit will not be enough')
assert.match(read('src/services/translationStudioService.ts'), /supabase\.rpc\('tl_ai_usage_today', \{ p_fansub_id: fansubId \}\)/)

console.log('PASS translation studio daily page credit (DB, worker order, error code, UI)')
