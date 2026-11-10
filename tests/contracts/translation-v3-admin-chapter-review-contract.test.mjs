import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { handleTranslationAdminPage } from '../../functions/api/ceviri/admin-page.js'
import { handleTranslationReaderTranslate } from '../../functions/api/ceviri/reader-translate.js'
import { untranslate } from './i18n-source.mjs'

const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
const sql = read('supabase/migrations/20260929200000_translation_studio_v3_admin_chapter_review.sql')
const fn = (name) => {
  const start = sql.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} tanimli`)
  return sql.slice(start, sql.indexOf('$function$;', start))
}

// --- DB: every path is site admin only -------------------------------------------------------
for (const name of ['public.admin_chapter_studio_review', 'public.tl_admin_page_object_key', 'public.tl_admin_translation_source']) {
  assert.match(fn(name), /if not app_private\.is_admin\(\) then/, `${name}: site admin only (on the server)`)
  assert.match(sql, new RegExp(`revoke all on function ${name.replace('.', '\\.')}\\([^)]*\\) from public, anon;`), `${name}: anon closed`)
}
assert.match(fn('public.admin_chapter_studio_review'), /'source_text', item\.source_text/, 'orijinal metin')
assert.match(fn('public.admin_chapter_studio_review'), /jsonb_object_agg\(t\.language/, 'all languages')
assert.match(fn('public.tl_admin_page_object_key'), /if p_kind not in \('raw', 'clean'\) then/)
assert.doesNotMatch(sql, /pg_catalog\.(greatest|extract)\b/)

// --- Worker: admin-page yetki kararini DB'ye birakir, anahtar bicimini dogrular -----------------
const env = { VITE_SUPABASE_URL: 'https://db', VITE_SUPABASE_ANON_KEY: 'anon' }
const PAGE = '22222222-2222-4222-8222-222222222222'
const KEY = `pages/${PAGE}/${'a'.repeat(64)}.webp`
function client(rpcResult) {
  return () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
    rpc: () => ({ abortSignal() { return this }, then(resolve) { return Promise.resolve(rpcResult).then(resolve) } }),
  })
}
const bucket = { get: async (key) => (key === KEY ? { body: 'img', httpMetadata: { contentType: 'image/webp' } } : null) }
const request = (headers = { authorization: 'Bearer t' }) => new Request(`https://x/api/ceviri/admin-page?page_id=${PAGE}`, { headers })
assert.equal((await handleTranslationAdminPage(request({}), { ...env, TYPESET_RAW_BUCKET: bucket }, { createClient: client({ data: KEY }) })).status, 401, '401 with no session')
assert.equal((await handleTranslationAdminPage(request(), { ...env, TYPESET_RAW_BUCKET: bucket }, { createClient: client({ data: null, error: { code: '42501' } }) })).status, 403, 'admin olmayan 403')
assert.equal((await handleTranslationAdminPage(request(), { ...env, TYPESET_RAW_BUCKET: bucket }, { createClient: client({ data: '../gizli' }) })).status, 404, 'an invalid key is not read')
const ok = await handleTranslationAdminPage(request(), { ...env, TYPESET_RAW_BUCKET: bucket }, { createClient: client({ data: KEY }) })
assert.equal(ok.status, 200)
assert.equal(ok.headers.get('cache-control'), 'private, max-age=300')

// --- reader-translate admin kapsami ------------------------------------------------------------
const translate = read('functions/api/ceviri/reader-translate.js')
assert.match(translate, /readJson\(request, \['chapter_id', 'language', 'scope'\], 1024\)/)
assert.match(translate, /adminScope \? 'tl_admin_translation_source' : 'tl_reader_translation_source'/)
assert.match(translate, /db\.rpc\('tl_chapter_ai_allowed'/, '+18 kurali admin kapsaminda da gecerli')
assert.match(translate, /await assertBudget\(service, env, source\.fansub_id\)/, 'gunluk butce korunur')
const badScope = await handleTranslationReaderTranslate(new Request('https://x/api/ceviri/reader-translate', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chapter_id: '66666666-6666-4666-8666-666666666666', language: 'en', scope: 'root' }),
}), env, { assertUploadRateLimit: async () => {} })
assert.equal(badScope.status, 400, 'bilinmeyen kapsam reddedilir')
const anonAdmin = await handleTranslationReaderTranslate(new Request('https://x/api/ceviri/reader-translate', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chapter_id: '66666666-6666-4666-8666-666666666666', language: 'en', scope: 'admin' }),
}), env, { assertUploadRateLimit: async () => {} })
assert.equal(anonAdmin.status, 401, 'admin scope requires a session')

// --- Istemci ---------------------------------------------------------------------------------
const service = read('src/services/translationAdminReviewService.ts')
assert.match(service, /supabase\.rpc\('admin_chapter_studio_review', \{ p_chapter_id: chapterId \}\)/)
assert.match(service, /\/api\/ceviri\/admin-page\?page_id=/)
assert.match(service, /JSON\.stringify\(\{ chapter_id: chapterId, language, scope: 'admin' \}\)/)
assert.match(service, /throw new StudioCodedError\(message, parsed\.data\.code\)/, 'error codes show through studioErrors')
const texts = read('src/components/admin/chapterReview/AdminChapterTexts.tsx')
assert.match(texts, /describeStudioError\(error, 'Çeviri başarısız\.'\)/)
assert.match(texts, /data-testid="admin-chapter-texts"/)
const review = read('src/components/admin/chapterReview/AdminChapterStudioReview.tsx')
assert.match(review, /data-testid="admin-chapter-studio-review"/)
assert.match(review, /<Pane label="Ham"[\s\S]*<Pane label="Çevrilmiş/, 'yan yana ham | cevrilmis')
assert.match(read('src/components/admin/manga-control/MangaDetailChapterReview.tsx'), /<AdminChapterStudioReviewButton chapterId=\{chapter\.id\} \/>/, 'Manga Kontrol')
// In a revision row the row id is the revision; the review opens with the target chapter.
assert.match(read('src/components/admin/pending/AdminPendingDetailContent.tsx'), /<AdminChapterStudioReviewButton chapterId=\{item\.chapterId \?\? item\.id\}/, 'Pending Approvals > chapter and chapter revision')
assert.match(read('src/services/mangaService/moderation.pending.revisions.ts'), /revisionId: revision\.id,\s+chapterId: revision\.targetId,/, 'a chapter revision carries the target chapter id')

console.log('PASS admin chapter review (raw + translation, texts, new language; site admin only)')
