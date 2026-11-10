/**
 * Reader v2 migration contract (Phase 7).
 *
 * Protects two things at once:
 * A) Chapter links in the app go to the NEW reader (changed in one
 * place: buildPublicChapterPath).
 * B) The OLD reader stays IN RESERVE and INTERNALLY CONSISTENT: its routes are not deleted
 * and v1's internal navigation (canonical redirect, previous/next chapter)
 * does not throw users to the new reader; otherwise the reader kept as
 * "reserve" would be abandoned at the first click.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

const moduleCache = new Map()
function loadModule(relativePath) {
  if (moduleCache.has(relativePath)) return moduleCache.get(relativePath)
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  moduleCache.set(relativePath, shim.exports)
  const requireShim = (specifier) => {
    if (specifier.startsWith('./')) return loadModule(`src/lib/${specifier.slice(2)}.ts`)
    if (specifier.startsWith('@/')) return loadModule(`src/${specifier.slice(2)}.ts`)
    return {}
  }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, requireShim)
  return shim.exports
}

const routes = loadModule('src/lib/routes.ts')

const chapterInput = {
  mangaId: '11111111-1111-1111-1111-111111111111',
  mangaSlug: 'altin-lonca',
  mangaTitle: 'Altin Lonca',
  chapterNumber: 12,
}

// ---------- A) Links go to the new reader ----------
{
  const href = routes.buildPublicChapterPath(chapterInput)
  assert.match(href, /^\/oku\//, 'chapter links must go to the new reader')
  assert.equal(href, '/oku/altin-lonca/12', 'a slug must be used if there is one')

  const withFansub = routes.buildPublicChapterPath({
    ...chapterInput,
    fansubId: '22222222-2222-2222-2222-222222222222',
    fansubSlug: 'test-ekibi',
  })
  assert.equal(withFansub, '/oku/altin-lonca/12/test-ekibi', 'fansub surumu adreste tasinmali')

  const withVersion = routes.buildPublicChapterPath({
    ...chapterInput,
    chapterId: '33333333-3333-3333-3333-333333333333',
    forceVersionQuery: true,
  })
  assert.match(withVersion, /\?surum=33333333/, 'surum ayirt edicisi v2 sorgu adiyla gecmeli')
  assert.doesNotMatch(withVersion, /\?version=/, 'v1 sorgu adi (version) v2 adresinde kullanilmamali')

  // An invalid chapter number falls to the series (no empty address for the reader).
  assert.equal(
    routes.buildPublicChapterPath({ ...chapterInput, chapterNumber: 0 }),
    routes.buildPublicMangaPath({ id: chapterInput.mangaId, slug: chapterInput.mangaSlug, title: chapterInput.mangaTitle }),
    'an invalid chapter number must fall to the series page',
  )
}

// ---------- B) The old reader is in reserve and consistent ----------
{
  const legacy = routes.buildLegacyPublicChapterPath(chapterInput)
  assert.match(legacy, /\/bolum\/12$/, 'the old path must be kept')
  assert.doesNotMatch(legacy, /^\/oku\//, 'the old helper must not go to the new reader')
}

const appSource = read('src/App.tsx')
for (const legacyRoute of [
  /path='manga\/:id\/bolum\/:chapterNumber'/,
  /path='manga\/:id\/bolum\/:chapterNumber\/:fansubKey'/,
  /path='manga\/:id\/chapter\/:chapterNumber'/,
]) {
  assert.match(appSource, legacyRoute, 'old reader routes must not be deleted (old links must work)')
}

// v1's INTERNAL navigation must use the old helper: the reserve reader should not throw the user
// to v2 on the first "next chapter" click.
for (const legacyFile of [
  'src/pages/mangaReader/readerChapterRouting.ts',
  'src/pages/mangaReader/useMangaReaderData.ts',
  'src/pages/mangaReader/useReaderViewportController.ts',
]) {
  const source = read(legacyFile)
  assert.match(source, /buildLegacyPublicChapterPath/, `${legacyFile} must use the old helper`)
  assert.doesNotMatch(
    source,
    /[^y]buildPublicChapterPath\b/,
    `${legacyFile} must not redirect to the new reader (the reserve must stay internally consistent)`,
  )
}

// ---------- C) The notification address goes to the new reader too ----------
const notificationMigration = read('supabase/migrations/20260730130000_chapter_notification_reader_v2_route.sql')
const migrationBody = notificationMigration.replace(/^\s*--.*$/gm, '')
assert.match(
  migrationBody,
  /'route_hint', format\('\/oku\/%s\/%s\/%s'/,
  'a new chapter notification must land on the new reader',
)
assert.match(migrationBody, /v_fansub_id::text/, 'the notification must open the right fansub version')
assert.doesNotMatch(migrationBody, /create policy|alter policy/i, 'this migration must not add a policy')
// Fonksiyon govdesi kopyalandi: kapilarin (bayrak, onay, yayin zamani) kazara
// dusmedigini pinle.
for (const guard of [
  /is_feature_enabled\('home\.follow_feed'/,
  /coalesce\(new\.is_approved, false\) = false/,
  /v_publish_at > now\(\)/,
]) {
  assert.match(migrationBody, guard, 'existing gates must be kept while copying the function')
}

console.log('PASS reader v2 migration contract verified (links to /oku, v1 in reserve and consistent)')
