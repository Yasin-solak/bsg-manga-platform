import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runRoutes, TranslationAiError } from '../../functions/_shared/translation-ai.js'
import { errorResponse, HttpError } from '../../functions/_shared/translation-http.js'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// --- +18 series: AI off (DB + worker + UI) --------------------------------------
const migration = read('supabase/migrations/20260929140943_translation_studio_v3_mature_ai_block.sql')
assert.match(migration, /alter table public\.translation_series_drafts add column if not exists is_mature boolean not null default false;/)
assert.match(migration, /is_new, is_mature\)/, 'taslak onayinda +18 mangaya tasinir')
assert.match(migration, /if v_draft\.is_mature then update public\.mangas set is_mature = true where id = v_manga; end if;/, 'if tied to an existing series it can only rise')
assert.match(migration, /return not app_private\.tl_project_is_mature\(p_project_id\);/)
assert.match(migration, /create or replace function public\.tl_chapter_ai_allowed/)

const http = read('functions/_shared/translation-http.js')
assert.match(http, /db\.rpc\('tl_project_ai_allowed', \{ p_project_id: projectId \}\)/)
for (const worker of ['scan.js', 'translate.js', 'reread.js']) {
  const source = read(`functions/api/ceviri/${worker}`)
  assert.match(source, /await requireAiAllowed\(db, project\.id\)/, `${worker}: no image/text sent on a +18 series`)
  // Kontrol, yapay zekaya giden her seyden once (karo okuma / model cagrisi) yapilir.
  assert.ok(source.indexOf('requireAiAllowed(db, project.id)') < source.indexOf('runRoutes('), `${worker}: kontrol model cagrisindan once`)
}
assert.match(read('functions/api/ceviri/reader-translate.js'), /db\.rpc\('tl_chapter_ai_allowed', \{ p_chapter_id: chapterId \}\)/, 'reader translation follows the same rule')

// A coded HTTP error reaches the client with its reason.
const mature = errorResponse(new HttpError(403, 'kapali', {}, 'ai_disabled_mature'))
assert.equal(mature.status, 403)
assert.equal((await mature.json()).code, 'ai_disabled_mature')

// --- AI error classification -------------------------------------------------------------
const routes = [
  { provider: 'google', model: 'gemini-a', priority: 0 },
  { provider: 'google', model: 'gemini-b', priority: 1 },
]
const env = { GEMINI_API_KEY: 'k' }
const request = { instructions: 'x', text: 'y', schema: { type: 'object', properties: {} }, maxTokens: 100, name: 't' }
const noSleep = async () => {}

// Istem engeli (HTTP 200 + promptFeedback): content_blocked, ikinci modele GONDERILMEZ.
let calls = 0
await assert.rejects(
  () => runRoutes(routes, env, request, { sleep: noSleep, fetchImpl: async () => { calls += 1; return Response.json({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }) } }),
  (error) => error instanceof TranslationAiError && error.code === 'content_blocked',
)
assert.equal(calls, 1, 'engellenen icerik baska modele/saglayiciya gonderilmez')

// The response block (finishReason SAFETY) is the same.
calls = 0
await assert.rejects(
  () => runRoutes(routes, env, request, { sleep: noSleep, fetchImpl: async () => { calls += 1; return Response.json({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }) } }),
  (error) => error.code === 'content_blocked',
)
assert.equal(calls, 1)

// Gunluk kota / faturalandirma: dakikalik yogunluktan ayri kod.
await assert.rejects(
  () => runRoutes(routes, env, request, { sleep: noSleep, fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'You exceeded your current quota, please check your plan and billing details.' } }), { status: 429 }) }),
  (error) => error.code === 'quota_exhausted',
)
// Per-minute limit: provider_busy (the client waits and retries).
await assert.rejects(
  () => runRoutes(routes, env, request, { sleep: noSleep, fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Resource has been exhausted (e.g. check quota).' } }), { status: 429, headers: { 'retry-after': '1' } }) }),
  (error) => error.code === 'provider_busy',
)
// Gecersiz anahtar.
await assert.rejects(
  () => runRoutes(routes, env, request, { sleep: noSleep, fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 }) }),
  (error) => error.code === 'provider_auth',
)
// Content block gives the client 422 (retrying is useless).
const blocked = errorResponse(new TranslationAiError('content_blocked', 'engel'))
assert.equal(blocked.status, 422)
assert.equal((await blocked.json()).code, 'content_blocked')

// --- Arayuz -------------------------------------------------------------------------------
const errorsSource = read('src/pages/translationStudio/studioErrors.ts')
for (const code of ['content_blocked', 'ai_disabled_mature', 'provider_busy', 'quota_exhausted', 'provider_auth', 'timeout']) {
  assert.match(errorsSource, new RegExp(`${code}: \\{`), `reason and suggestion for ${code}`)
}
assert.match(errorsSource, /content_blocked: \{[\s\S]{0,300}retryable: false/, 'no retry suggested on a content block')
const scan = read('src/pages/translationStudio/StepScan.tsx')
assert.match(scan, /data-testid='tl-scan-mature'/, 'a clear explanation instead of a scan on a +18 series')
assert.match(scan, /data-testid='tl-scan-error-group'/, 'errors group by reason')
assert.match(scan, /\['quota_exhausted', 'provider_auth', 'not_configured', 'ai_disabled_mature'(?:, '\w+')*\]\.includes\(info\.code\)\) haltRef\.current = info/, 'the queue stops on a quota/config error')
assert.match(read('src/pages/translationStudio/StepSeries.tsx'), /data-testid='tl-draft-mature'/, '+18 choice for a new series in the first step')
assert.match(read('src/pages/translationStudio/TranslationStudioPage.tsx'), /const access = project\?\.isMature \? \{ \.\.\.baseAccess, ai: false \} : baseAccess/)
assert.match(read('src/pages/translationStudio/editor/EditorPanels.tsx'), /disabled=\{rereading \|\| !access\.ai\}/, 're-read is off on a +18 series')

console.log('PASS translation studio +18 AI off and error reasons (DB, worker, classification, UI)')
