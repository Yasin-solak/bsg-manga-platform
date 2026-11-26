import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { untranslate } from './i18n-source.mjs'

const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))

// --- DB: one-call summary, site admin only ----------------------------------------------------
const sql = read('supabase/migrations/20260929161407_translation_studio_v3_admin_overview.sql')
for (const fn of ['admin_translation_studio_overview', 'admin_set_translation_default_limit', 'admin_review_translation_content']) {
  const body = sql.slice(sql.indexOf(`function public.${fn}`))
  assert.match(body.slice(0, 900), /if not app_private\.is_admin\(\) then/, `${fn}: site admin only`)
}
assert.match(sql, /least\(greatest\(coalesce\(p_days, 7\), 1\), 90\)/, 'period limited to 1-90 days')
for (const key of ["'totals'", "'daily'", "'stages'", "'errors'", "'models'", "'fansubs'", "'flags'", "'defaultLimit'"]) {
  assert.ok(sql.includes(key), `the summary contains ${key}`)
}
// Boost tiers (20261122100000): per-tier limits replace the single default; the setter is admin only
// and validated, the overview returns tierLimits and lists every active team (for manual grants).
const tiers = read('supabase/migrations/20261122100000_translation_studio_boost_tiers.sql')
const tierSetter = tiers.slice(tiers.indexOf('function public.admin_set_translation_tier_limits'))
assert.match(tierSetter.slice(0, 900), /if not app_private\.is_admin\(\) then/, 'tier limits: site admin only')
assert.match(tierSetter, /\(p_limits ->> v_tier\) !~ '\^\[0-9\]\{1,5\}\$'/, 'tier limits are whole numbers')
assert.match(tiers, /drop function if exists public\.admin_set_translation_default_limit\(integer\);/)
assert.match(tiers, /'tierLimits', jsonb_build_object\(/)
assert.match(tiers, /union select id from public\.fansubs where is_active/)
assert.match(read('src/services/translationAdminService.ts'), /supabase\.rpc\('admin_set_translation_tier_limits', \{ p_limits: limits \}\)/)
// Content check: content block on non +18 series; after "no issue" it is listed again only if a new block arrives.
assert.match(sql, /where j\.error = 'content_blocked'\s+and not app_private\.tl_project_is_mature\(p\.id\)/)
assert.match(sql, /having r\.blocked_count is null or count\(\*\) > r\.blocked_count/)
assert.match(sql, /update public\.mangas set is_mature = true where id = v_project\.manga_id/, 'a +18 decision makes the series adult (AI closes)')
assert.match(sql, /update public\.translation_series_drafts set is_mature = true where id = v_project\.series_draft_id/, 'onaysiz taslakta da')

// --- Istemci --------------------------------------------------------------------------------
const service = read('src/services/translationAdminService.ts')
assert.match(service, /supabase\.rpc\('admin_translation_studio_overview', \{ p_days: days \}\)/)
assert.match(service, /supabase\.rpc\('tl_set_fansub_credit_limit', \{ p_fansub_id: fansubId, p_limit: limit \}\)/)
// Monthly credits (20261123100000): the overview returns tierCredits and per-team month usage.
const credits = read('supabase/migrations/20261123100000_translation_studio_monthly_credits.sql')
assert.match(credits, /'tierCredits', jsonb_build_object\(/)
assert.match(credits, /'monthlyLimit', monthly_limit, 'monthCredits', month_credits/)
assert.match(service, /content_blocked: 'İçerik politikası engeli'/)
const section = read('src/components/admin/AdminTranslationStudioSection.tsx')
for (const testId of ['admin-translation-studio', 'admin-translation-flags', 'admin-translation-fansubs', 'admin-translation-limit', 'admin-translation-tier-limits', 'admin-translation-daily']) {
  assert.ok(section.includes(`data-testid="${testId}"`), `${testId} exists`)
}
assert.match(section, /title: 'Seriyi \+18 işaretle'/, '+18 karari onay ister')
assert.match(read('src/pages/admin/adminRoutes.ts'), /translation_studio: 'ceviri-studyosu'/)
assert.match(read('src/pages/admin/adminNavigation.ts'), /id: 'translation_studio',[\s\S]{0,240}group: 'content'/)
assert.match(read('src/pages/AdminPage.tsx'), /activeSection === 'translation_studio' && \(/)

console.log('PASS translation studio admin panel (summary, limits, content check, route)')
