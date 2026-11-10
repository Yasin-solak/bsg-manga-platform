import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { activeLocaleShim } from './i18n-source.mjs'

const require = createRequire(import.meta.url)
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function load(path, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)((name) => name === '@/i18n/activeLocale' ? activeLocaleShim : (name in mocks ? mocks[name] : require(name)), exports)
  return exports
}

// --- Tur katalogu: 100+ tur, sitedeki yazimlarla uyum, serbest ekleme ----------------------
const genres = load('src/lib/genreCatalog.ts')
assert.ok(genres.GENRE_CATALOG.length >= 100, `katalog 100+ tur (${genres.GENRE_CATALOG.length})`)
assert.equal(new Set(genres.GENRE_CATALOG).size, genres.GENRE_CATALOG.length, 'no repeats in the catalog')
for (const siteGenre of ['Aksiyon', 'Dram', 'Macera', 'Gizem', 'Komedi', 'Fantastik', 'Doğaüstü', 'Korku', 'Bilim Kurgu', 'Psikolojik', 'Slice of Life', 'Shounen', 'Romantik', 'Okul', 'Tarihi', 'Gerilim', 'Spor', 'Politik']) {
  assert.ok(genres.GENRE_CATALOG.includes(siteGenre), `sitedeki "${siteGenre}" yazimi katalogda`)
}
assert.ok(genres.GENRE_CATALOG.every((genre) => genre.length <= genres.MAX_GENRE_LENGTH), 'the catalog follows the DB length rule')
assert.equal(genres.normalizeGenre('drama'), 'Dram', 'synonym spelling ties to one genre')
assert.equal(genres.normalizeGenre('  ROMANTIZM '), 'Romantik')
assert.equal(genres.normalizeGenre('murim'), 'Murim', 'catalog spelling is preferred')
assert.equal(genres.normalizeGenre('uzay   korsanları'), 'Uzay korsanları', 'serbest tur: bosluk duzeltilir, bas harf buyur')
assert.equal(genres.normalizeGenre('x'.repeat(60)).length, 40)
assert.deepEqual(genres.searchGenres('reg', []).slice(0, 1), ['Geri Dönüş (Regresyon)'])
assert.equal(genres.searchGenres('', [{ genre: 'Webtoon', uses: 99 }])[0], 'Webtoon', 'sitede cok kullanilan tur one cikar')

const picker = read('src/pages/translationStudio/GenrePicker.tsx')
assert.match(picker, /data-testid='tl-genre-add'/, 'katalogda olmayan tur eklenebilir')
assert.match(picker, /known \? \[custom, \.\.\.found\.filter/, 'esanlamli yazim "ekle" yerine bilinen ture gider')
assert.match(read('src/pages/translationStudio/StepSeries.tsx'), /<GenrePicker value=\{draft\.genres\}/)
const genreMigration = read('supabase/migrations/20260929160559_translation_studio_v3_genre_suggestions.sql')
assert.match(genreMigration, /check \(app_private\.genres_valid\(genres\)\)/, 'DB length rule on a free genre')
assert.match(genreMigration, /create or replace function public\.tl_genre_suggestions\(\)/)

// --- Upload step: enlarge and delete ---------------------------------------------------------
const upload = read('src/pages/translationStudio/StepUpload.tsx')
assert.match(upload, /data-testid='tl-upload-open'/, 'clicking a page enlarges it')
assert.match(upload, /data-testid='tl-upload-delete'/, 'an uploaded page can be deleted')
assert.match(upload, /confirmDialog\(\{\s*title: txa\('Sayfayı sil'\)/, 'silmeden once onay')
assert.match(upload, /uploads\[page\.id\]\?\.state !== 'yukleniyor'/, 'a page still uploading is not deleted')
assert.match(upload, /queueRef\.current = queueRef\.current\.filter\(\(id\) => id !== pageId\)/, 'a deleted page leaves the queue')
const lightbox = read('src/pages/translationStudio/UploadLightbox.tsx')
assert.match(lightbox, /event\.key === 'Escape'/)
assert.match(lightbox, /event\.key === 'ArrowRight'/)

// --- Admin: seri talepleri gozden kacmaz ---------------------------------------------------
const nav = read('src/pages/admin/adminNavigation.ts')
assert.match(nav, /id: 'series_requests',[\s\S]{0,200}group: 'queues',\s*badge: seriesRequestPendingCount/, 'series requests in review queues, with a badge')
assert.ok(nav.indexOf("id: 'series_requests'") < nav.indexOf("id: 'community'"), 'Onay Bekleyenler in hemen altinda')
assert.match(read('src/pages/AdminPage.tsx'), /data-testid="admin-pending-series-requests"/, 'series request band in Pending Approvals too')
assert.match(read('src/components/admin/AdminSeriesRequestsSection.tsx'), /data-testid="admin-series-request-mature"/, 'admin +18 talebi gorur')

console.log('PASS translation studio intake flow (genre catalog, upload enlarge/delete, admin series requests)')
