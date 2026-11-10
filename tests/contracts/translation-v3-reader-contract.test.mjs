import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { handleTranslationReaderPage } from '../../functions/api/ceviri/reader-page.js'
import { handleTranslationReaderTranslate, normalizeReaderTranslations, READER_LANGUAGES } from '../../functions/api/ceviri/reader-translate.js'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const CHAPTER = '66666666-6666-4666-8666-666666666666'
const PROJECT = '11111111-1111-4111-8111-111111111111'
const ITEMS = ['33333333-3333-4333-8333-333333333331', '33333333-3333-4333-8333-333333333332']
const env = { VITE_SUPABASE_URL: 'https://db', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', OPENAI_API_KEY: 'o-key' }

// --- Model yaniti normalizasyonu ---
const map = normalizeReaderTranslations({ items: [{ id: ITEMS[0], text: ' Where are you going? ' }, { id: 'baska', text: 'x' }] }, ITEMS)
assert.equal(map.get(ITEMS[0]), 'Where are you going?')
assert.equal(map.size, 1)
assert.ok(!('tr' in READER_LANGUAGES), 'TR is the chapter image, not a reader translation')

// --- Fake client ---
const writes = []
function fakeClient(role, handlers) {
  const from = (table) => {
    const state = { table, op: 'select', filters: {}, payload: null }
    const api = {
      select() { return api }, eq(c, v) { state.filters[c] = v; return api }, in(c, v) { state.filters[c] = v; return api },
      gte() { return api }, order() { return api }, limit() { return api }, abortSignal() { return api },
      update(p) { state.op = 'update'; state.payload = p; return api }, upsert(p) { state.op = 'upsert'; state.payload = p; return api },
      single() { return Promise.resolve(handlers.table(role, state)) }, maybeSingle() { return Promise.resolve(handlers.table(role, state)) },
      then(resolve, reject) { return Promise.resolve(handlers.table(role, state)).then(resolve, reject) },
    }
    return api
  }
  return {
    from,
    rpc: (name, args) => ({ abortSignal() { return this }, then(resolve, reject) { return Promise.resolve(handlers.rpc(role, name, args)).then(resolve, reject) } }),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }
}

let readerMature = false
const handlers = {
  rpc(role, name, args) {
    assert.equal(role, 'reader', 'the access decision is made with the reader own client')
    if (name === 'tl_reader_translation_source') {
      assert.equal(args.p_language, 'en')
      return {
        data: {
          project_id: PROJECT, fansub_id: 'f1', source_language: 'ja',
          items: [
            { id: ITEMS[0], type: 'balon', source_text: 'どこへ行く', source_version: 2, tr_text: 'Nereye gidiyorsun?' },
            { id: ITEMS[1], type: 'sfx', source_text: 'ドン', source_version: 1, tr_text: 'GÜM' },
          ],
        },
        error: null,
      }
    }
    if (name === 'tl_chapter_ai_allowed') return { data: !readerMature, error: null }
    if (name === 'tl_reader_clean_key') return { data: args.p_index === 0 ? `clean/${PROJECT}/${'b'.repeat(64)}.webp` : 'pages/x/raw.png', error: null }
    return { data: null, error: null }
  },
  table(role, state) {
    const { table, op, payload } = state
    if (op !== 'select') writes.push({ role, table, op, filters: { ...state.filters }, payload })
    if (table === 'translation_jobs' && op === 'upsert') return { data: [{ id: 'job-1' }], error: null }
    if (table === 'translation_model_routes') return { data: [{ provider: 'openai', model: 'gpt-4.1-mini', priority: 0, input_cost_per_mtok: 0.4, output_cost_per_mtok: 1.6 }], error: null }
    // The second item has human text: it must be separated from machine lettering.
    if (table === 'translation_item_texts' && op === 'select') return { data: [{ item_id: ITEMS[1], origin: 'human' }], error: null }
    return { data: [], error: null }
  },
}

const translateResponse = await handleTranslationReaderTranslate(new Request('https://x/api/ceviri/reader-translate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chapter_id: CHAPTER, language: 'en' }),
}), env, {
  createClient: (_url, key) => fakeClient(key === 'service' ? 'service' : 'reader', handlers),
  assertUploadRateLimit: async () => {},
  fetch: async (_url, init) => {
    const body = JSON.parse(init.body)
    const content = JSON.parse(body.input[0].content[0].text)
    assert.equal(content.entries[0].turkish, 'Nereye gidiyorsun?', 'TR goes as context')
    assert.match(body.instructions, /Turkish as the authority/)
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ items: [{ id: ITEMS[0], text: 'Where are you going?' }, { id: ITEMS[1], text: 'BOOM' }] }) }] }], usage: { input_tokens: 500, output_tokens: 40 } })
  },
})
assert.equal(translateResponse.status, 200, await translateResponse.clone().text())
const upsert = writes.find((write) => write.table === 'translation_item_texts' && write.op === 'upsert')
assert.equal(upsert.role, 'service')
assert.deepEqual(upsert.payload.map((row) => [row.item_id, row.text, row.origin, row.source_version]), [[ITEMS[0], 'Where are you going?', 'machine', 2]],
  'an item with human text is not overwritten by the machine; the source version is kept')

// +18 series: no automatic translation for the reader either, the model is not called.
readerMature = true
const matureRead = await handleTranslationReaderTranslate(new Request('https://x/api/ceviri/reader-translate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chapter_id: CHAPTER, language: 'en' }),
}), env, {
  createClient: (_url, key) => fakeClient(key === 'service' ? 'service' : 'reader', handlers),
  assertUploadRateLimit: async () => {},
  fetch: async () => { throw new Error('the model must not be called on a +18 series') },
})
assert.equal(matureRead.status, 403)
assert.equal((await matureRead.json()).code, 'ai_disabled_mature')
readerMature = false

// --- Clean page: only the clean/ key is served ---
const bucket = { get: async (key) => ({ body: key, httpMetadata: { contentType: 'image/webp' } }) }
const pageEnv = { ...env, TYPESET_RAW_BUCKET: bucket }
const pageDeps = { createClient: () => fakeClient('reader', handlers), assertUploadRateLimit: async () => {} }
const ok = await handleTranslationReaderPage(new Request(`https://x/api/ceviri/reader-page?chapter_id=${CHAPTER}&index=0`), pageEnv, pageDeps)
assert.equal(ok.status, 200)
assert.match(ok.headers.get('cache-control'), /^private/)
const denied = await handleTranslationReaderPage(new Request(`https://x/api/ceviri/reader-page?chapter_id=${CHAPTER}&index=1`), pageEnv, pageDeps)
assert.equal(denied.status, 404, 'the raw key is never served to the reader')

// --- Kaynak duzeyi sozlesmeler ---
const migration = read('supabase/migrations/20260925213843_translation_studio_v3_reader.sql')
assert.match(migration, /can_current_user_access_chapter\(chapter\.publish_at\)/, 'publish time/early access rule')
assert.match(migration, /not manga\.is_mature or app_private\.current_user_is_adult\(\)/, 'adult gate')
assert.match(migration, /grant execute on function public\.tl_reader_overlay\(uuid, text\) to anon, authenticated/)
const publish = read('src/pages/translationStudio/editor/StepPublish.tsx')
assert.ok(publish.indexOf('uploadCleanPage(') < publish.indexOf('createChapter(project.fansubId'), 'clean bases load before the chapter')
assert.match(publish, /reorderPages\(project\.id/, 'drag and drop order is written to the DB before publish')
const reader = read('src/pages/reader/ReaderV2Page.tsx')
assert.match(reader, /useReaderTranslation\(chapter\?\.id\)/)
assert.doesNotMatch(reader, /useReaderStudioPublication/, 'the reader does not use the V2 studio layer')

console.log('PASS translation studio v3 reader contract (language generation, clean base access, publish order)')
