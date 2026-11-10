import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { handleTranslationReread, normalizeReread, rereadTile } from '../../functions/api/ceviri/reread.js'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// --- Re-read tile: 12% margin, page and 2048 px limit ---
const page = { width: 1000, height: 3000 }
assert.deepEqual(rereadTile({ bbox_x: 100, bbox_y: 200, bbox_w: 200, bbox_h: 100 }, page),
  { x: 76, y: 188, width: 248, height: 124, pageWidth: 1000, pageHeight: 3000 })
assert.deepEqual(rereadTile({ bbox_x: 0, bbox_y: 0, bbox_w: 1000, bbox_h: 2900 }, page).height, 2048)
assert.equal(normalizeReread({ text: '  どこへ\n', confidence: 1.4 }).confidence, 1)
assert.throws(() => normalizeReread({ text: 5 }))

// --- Uctan uca: sahte Supabase + sahte karo + sahte model ---
const ITEM = '33333333-3333-4333-8333-333333333331'
const PAGE = '22222222-2222-4222-8222-222222222221'
const PROJECT = '11111111-1111-4111-8111-111111111111'
const writes = []
const rpcCalls = []
let studioPermissions = new Set(['ceviri.metin'])
let matureSeries = false
let dailyLimitReached = false

function fakeClient(role) {
  const builder = (table) => {
    const state = { table, op: 'select', filters: {}, payload: null }
    const api = {
      select() { return api },
      eq(column, value) { state.filters[column] = value; return api },
      in() { return api },
      gte() { return api },
      order() { return api },
      limit() { return api },
      abortSignal() { return api },
      update(payload) { state.op = 'update'; state.payload = payload; return api },
      upsert(payload) { state.op = 'upsert'; state.payload = payload; return api },
      maybeSingle() { return Promise.resolve(resolve(role, state, true)) },
      single() { return Promise.resolve(resolve(role, state, true)) },
      then(onFulfilled, onRejected) { return Promise.resolve(resolve(role, state, false)).then(onFulfilled, onRejected) },
    }
    return api
  }
  return {
    from: builder,
    // Studio permission is asked with the user's JWT (Roles and Permissions).
    rpc: async (name, args) => {
      rpcCalls.push({ role, name, args })
      if (name === 'tl_project_ai_allowed') return { data: !matureSeries, error: null }
      if (name === 'tl_claim_ai_page') return { data: { allowed: !dailyLimitReached, used: 60, limit: 60 }, error: null }
      return { data: name === 'tl_has_permission' ? studioPermissions.has(args.p_permission) : null, error: null }
    },
    auth: { getUser: async () => ({ data: { user: { id: 'auth-user' } }, error: null }) },
  }
}

function resolve(role, state, single) {
  const { table, op, filters, payload } = state
  if (op !== 'select') writes.push({ role, table, op, filters: { ...filters }, payload })
  if (table === 'translation_items' && op === 'select') {
    return { data: { id: ITEM, page_id: PAGE, bbox_x: 100, bbox_y: 200, bbox_w: 200, bbox_h: 100, version: 4 }, error: null }
  }
  if (table === 'translation_pages') {
    return {
      data: {
        id: PAGE, project_id: PROJECT, raw_status: 'ready', raw_object_key: `pages/${PAGE}/${'a'.repeat(64)}.png`, raw_sha256: 'a'.repeat(64),
        raw_mime_type: 'image/png', raw_byte_size: 1000, width: 1000, height: 3000, scan_stage: 'suggested', version: 2,
        translation_projects: { id: PROJECT, fansub_id: 'f1', manga_id: null, source_language: 'ja', target_language: 'tr' },
      },
      error: null,
    }
  }
  if (table === 'translation_jobs' && op === 'upsert') return { data: [{ id: 'job-1' }], error: null }
  if (table === 'translation_jobs' && op === 'select') return { data: [], error: null }
  if (table === 'translation_jobs' && op === 'update') return { data: null, error: null }
  if (table === 'translation_model_routes') {
    return { data: [{ provider: 'openai', model: 'gpt-4.1', priority: 0, input_cost_per_mtok: 2, output_cost_per_mtok: 8 }], error: null }
  }
  if (table === 'translation_items' && op === 'update') {
    return { data: [{ source_text: payload.source_text, ocr_confidence: payload.ocr_confidence, version: 5, source_version: 3 }], error: null }
  }
  return { data: single ? null : [], error: null }
}

let tileRequest = null
const response = await handleTranslationReread(new Request('https://x/api/ceviri/reread', {
  method: 'POST',
  headers: { authorization: 'Bearer user-token', 'content-type': 'application/json' },
  body: JSON.stringify({ item_id: ITEM }),
}), {
  VITE_SUPABASE_URL: 'https://db', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', OPENAI_API_KEY: 'o-key',
}, {
  createClient: (_url, key) => fakeClient(key === 'service' ? 'service' : 'user'),
  assertUploadRateLimit: async () => {},
  readTile: async (_env, raw, tile) => { tileRequest = { raw, tile }; return { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' } },
  fetch: async (url, init) => {
    assert.match(String(url), /openai/)
    const body = JSON.parse(init.body)
    assert.equal(body.text.format.name, 'manga_text_reread')
    return Response.json({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ text: 'どこへ行く', confidence: 0.91 }) }] }],
      usage: { input_tokens: 1000, output_tokens: 20 },
    })
  },
})
assert.equal(response.status, 200, await response.clone().text())
assert.deepEqual(await response.json(), { source_text: 'どこへ行く', ocr_confidence: 0.91, version: 5, source_version: 3 })
assert.deepEqual(tileRequest.tile, { x: 76, y: 188, width: 248, height: 124, pageWidth: 1000, pageHeight: 3000 })
const itemWrite = writes.find((write) => write.table === 'translation_items' && write.op === 'update')
assert.equal(itemWrite.role, 'service', 'OCR text is written only with the service client')
assert.equal(itemWrite.filters.version, 4, 'writes must be version controlled')
assert.equal(itemWrite.payload.source_origin, 'ocr')
const jobFinish = writes.find((write) => write.table === 'translation_jobs' && write.op === 'update')
assert.equal(jobFinish.payload.status, 'succeeded')
assert.equal(jobFinish.payload.cost_usd, 0.00216)
assert.deepEqual(rpcCalls[0], { role: 'user', name: 'tl_has_permission', args: { p_fansub_id: 'f1', p_permission: 'ceviri.metin' } }, 'permission is asked with the user own client')

// A member with only "view" / "cleanup" permission cannot re-read (AI + source text).
studioPermissions = new Set(['ceviri.gor', 'ceviri.temizlik'])
const writesBefore = writes.length
const denied = await handleTranslationReread(new Request('https://x/api/ceviri/reread', {
  method: 'POST',
  headers: { authorization: 'Bearer user-token', 'content-type': 'application/json' },
  body: JSON.stringify({ item_id: ITEM }),
}), {
  VITE_SUPABASE_URL: 'https://db', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', OPENAI_API_KEY: 'o-key',
}, {
  createClient: (_url, key) => fakeClient(key === 'service' ? 'service' : 'user'),
  assertUploadRateLimit: async () => {},
  readTile: async () => { throw new Error('the tile must not be read on a forbidden request') },
  fetch: async () => { throw new Error('the model must not be called on a forbidden request') },
})
assert.equal(denied.status, 403, 're-read is rejected without text/typesetting permission')
assert.equal(writes.length, writesBefore, 'a forbidden request writes nothing (including the job record)')

// +18 seri: izin olsa bile hicbir gorsel yapay zekaya gitmez.
studioPermissions = new Set(['ceviri.metin'])
matureSeries = true
const matureWrites = writes.length
const matureResponse = await handleTranslationReread(new Request('https://x/api/ceviri/reread', {
  method: 'POST',
  headers: { authorization: 'Bearer user-token', 'content-type': 'application/json' },
  body: JSON.stringify({ item_id: ITEM }),
}), {
  VITE_SUPABASE_URL: 'https://db', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', OPENAI_API_KEY: 'o-key',
}, {
  createClient: (_url, key) => fakeClient(key === 'service' ? 'service' : 'user'),
  assertUploadRateLimit: async () => {},
  readTile: async () => { throw new Error('the tile must not be read on a +18 series') },
  fetch: async () => { throw new Error('the model must not be called on a +18 series') },
})
assert.equal(matureResponse.status, 403)
assert.equal((await matureResponse.json()).code, 'ai_disabled_mature', 'the reason is reported with a code')
assert.equal(writes.length, matureWrites, 'a +18 request writes nothing')
matureSeries = false

// When the pilot daily page quota is used up the model is not called; it returns with a reason code.
dailyLimitReached = true
const limitWrites = writes.length
const limitResponse = await handleTranslationReread(new Request('https://x/api/ceviri/reread', {
  method: 'POST',
  headers: { authorization: 'Bearer user-token', 'content-type': 'application/json' },
  body: JSON.stringify({ item_id: ITEM }),
}), {
  VITE_SUPABASE_URL: 'https://db', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', OPENAI_API_KEY: 'o-key',
}, {
  createClient: (_url, key) => fakeClient(key === 'service' ? 'service' : 'user'),
  assertUploadRateLimit: async () => {},
  readTile: async () => { throw new Error('hak dolunca karo okunmamali') },
  fetch: async () => { throw new Error('hak dolunca model cagrilmamali') },
})
assert.equal(limitResponse.status, 429)
const limitBody = await limitResponse.json()
assert.equal(limitBody.code, 'daily_limit')
assert.match(limitBody.error, /60\/60 sayfa/, 'kullanim mesajda')
assert.equal(writes.length, limitWrites, 'hak dolunca hicbir sey yazilmaz')
assert.ok(rpcCalls.some((call) => call.role === 'user' && call.name === 'tl_claim_ai_page' && call.args.p_page_id === PAGE), 'the credit is requested with the user JWT')
dailyLimitReached = false

// --- Editor and publish contracts (source level) ---
const editorService = read('src/services/translationEditorService.ts')
assert.match(editorService, /\.update\(row\)\s*\n?\s*\.eq\('id', item\.id\)\.eq\('version', item\.version\)/, 'oge yazimi surum kontrollu')
assert.match(editorService, /origin: 'human'/, 'editorden gelen metin insan metni')
const clean = read('src/pages/translationStudio/editor/cleanRender.ts')
assert.match(clean, /export function sampleBackground/, 'dolgu zemin rengini olcer (koyu tabela beyaz bloga donmez)')
assert.match(clean, /inpaint\(/, 'onarim Telea inpaint kullanir')
const publish = read('src/pages/translationStudio/editor/StepPublish.tsx')
assert.match(publish, /createChapter\(project\.fansubId/, 'publishing uses the existing chapter flow')
assert.match(publish, /linkPublishedChapter\(project\.id, chapter\.id/, 'the project is tied to the published chapter')
assert.match(publish, /disabled=\{!project\.mangaId \|\| !canPublish/, 'chapter insert RLS is open only to the fansub admin; a moderator cannot publish')
assert.match(publish, /moderasyon onay/, 'a chapter pending approval is not reported as "published"')
assert.match(publish, /renderPagePair\(/, 'preview = the real output to publish (same render as the clean base)')
assert.match(read('supabase/migrations/20260925212040_translation_studio_v3_chapter_link.sql'),
  /tl_chapter_matches\(new\.chapter_id, new\.fansub_id, new\.manga_id, new\.chapter_number\)/, 'a project ties only to its own chapter')
const page2 = read('src/pages/translationStudio/TranslationStudioPage.tsx')
assert.match(page2, /<EditorScreen/)
assert.match(page2, /<StepPublish/)

console.log('PASS translation studio v3 editor contract (re-read endpoint, versioned write, cleanup, publish link)')

// Free area (lasso) and clone stamp
const model = read('src/pages/translationStudio/editor/editorModel.ts')
assert.doesNotMatch(model, /id: 'kement'[^}]*off: true/, 'kement araci etkin')
assert.doesNotMatch(model, /id: 'damga'[^}]*off: true/, 'klon damgasi etkin')
assert.match(clean, /export function pointInPolygon/, 'in a lasso area cleaning stays inside the polygon')
assert.match(clean, /stroke\.tool === 'damga'\) \{[\s\S]{0,260}stroke\.offset\.x[\s\S]{0,200}blendInto\(image\.data, source, alpha, opacity\)/, 'damga izi kaynak uzakligindan kopyalanir')
const stampMigration = read('supabase/migrations/20260926040119_translation_studio_v3_clone_stamp_fix.sql')
assert.match(stampMigration, /\(\(v_stroke->'offset'\) - 'x'::text - 'y'::text\)/, 'offset anahtar kontrolu parantezli (operator onceligi)')
assert.match(read('src/pages/translationStudio/editor/EditorScreen.tsx'), /const polygon = item\.polygon\.map\(\(point\) => \(\{ x: box\.x \+ \(point\.x - item\.x\) \* sx/, 'moving a lasso area transforms the polygon too')
console.log('PASS translation studio v3 lasso and clone stamp')

// The translate endpoint does not update per item (Functions subrequest limit); reading order and font
// suggestion are written with one service-role RPC, a page stage error does not pass silently.
const translateSource = read('functions/api/ceviri/translate.js')
assert.doesNotMatch(translateSource, /from\('translation_items'\)\s*\.update\(/, 'no update per item')
assert.match(translateSource, /service\.rpc\('tl_apply_item_meta'/)
assert.match(translateSource, /if \(stageError\) throw new HttpError/)
const metaMigration = read('supabase/migrations/20260926152736_translation_studio_v3_item_meta_batch.sql')
assert.match(metaMigration, /grant execute on function public\.tl_apply_item_meta\(uuid, jsonb\) to service_role/)
assert.match(metaMigration, /revoke all on function public\.tl_apply_item_meta\(uuid, jsonb\) from public, anon, authenticated/)
assert.match(metaMigration, /and i\.page_id = p_page_id/, 'only items of the given page')
assert.match(read('functions/_shared/translation-http.js'), /\[translation-job\] \$\{claim\.id\} could not be closed/)
console.log('PASS translation studio v3 bulk item write (subrequest limit)')
