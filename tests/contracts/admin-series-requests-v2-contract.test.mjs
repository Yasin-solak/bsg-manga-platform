import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

/*
 * Series requests v2:
 * - The rejection reason is stored, and the requesting member gets an approval or rejection notification (rejection
 * used to only change status, and the team did not know why).
 * - A card warns if the site has a series with the same / similar title (link rather than duplicate).
 * - Linking and rejecting are in separate dialogs; no inline search box.
 */
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

const sql = read('supabase/migrations/20261101100000_series_draft_review_note.sql').replace(/^\s*--.*$/gm, '')
assert.match(sql, /drop function if exists public\.tl_reject_series_draft\(uuid\);/, 'the old single signature goes away (PostgREST ambiguity)')
assert.match(sql, /create or replace function public\.tl_reject_series_draft\(p_draft_id uuid, p_note text default null\)/)
assert.match(sql, /if not app_private\.is_admin\(\) then/, 'site admin only')
assert.match(sql, /length\(v_note\) > 500/, 'reason limit')
assert.match(sql, /set status = 'rejected', review_note = v_note, reviewed_at = now\(\)/)
assert.match(sql, /revoke all on function public\.tl_reject_series_draft\(uuid, text\) from public, anon;/)
assert.match(sql, /after update of status on public\.translation_series_drafts/, 'decision notification trigger')
assert.match(sql, /'tl_series_draft_approved'/)
assert.match(sql, /'tl_series_draft_rejected'/)

const service = read('src/services/translationStudioService.ts')
assert.match(service, /supabase\.rpc\('tl_reject_series_draft', \{ p_draft_id: draftId, p_note: reason \|\| null \}\)/)

// Pure functions (only a type import).
const out = {}
const code = ts.transpileModule(read('src/components/admin/seriesRequestMatching.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
new Function('require', 'exports', code)(() => ({}), out)

assert.equal(out.seriesTitleKey('  Sis ŞEHRİ: Yeni Bölüm! '), 'sis sehri yeni bolum')
const catalog = [{ id: 'a', title: 'Sis Şehri' }, { id: 'b', title: 'Gece Yolcusu' }]
assert.equal(out.findSimilarSeries('sis sehri', catalog)?.id, 'a', 'accent / case difference')
assert.equal(out.findSimilarSeries('Gece Yolcusu (Yeni)', catalog)?.id, 'b', 'baslik digerini kapsiyor')
assert.equal(out.findSimilarSeries('Bambaska', catalog), null)
assert.equal(out.findSimilarSeries('ab', catalog), null, 'no warning on a very short title')

const section = read('src/components/admin/AdminSeriesRequestsSection.tsx')
assert.match(section, /data-testid="admin-series-request-similar"/)
assert.match(section, /<SeriesLinkDialog/)
assert.match(section, /<SeriesRejectDialog/)
assert.match(section, /rejectSeriesDraft\(draft\.id, note\)/, 'the reason goes to the service')
assert.doesNotMatch(section, /confirmDialog/, 'no reasonless confirm window')

console.log('PASS series requests v2 (reason + notification, similar series warning, windows)')
