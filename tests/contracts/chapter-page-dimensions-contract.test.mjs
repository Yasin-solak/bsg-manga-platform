/**
 * Chapter page dimensions contract (Phase 6b).
 *
 * The most critical decision: dimensions are keyed by page REFERENCE, NOT index.
 * An indexed array would shift dimensions to the wrong pages when pages are added/deleted/reordered,
 * and wrong space reservation is WORSE than none
 * (a permanent, self-unrepairing jump). This file pins that property by behavior.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

function loadModule(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, () => ({}))
  return shim.exports
}

const dims = loadModule('src/lib/chapterPageDimensions.ts')

// ---------- A) Siralama degisince boyutlar kaymaz ----------
{
  const map = {
    'ref-a': { w: 1200, h: 1800 },
    'ref-b': { w: 800, h: 1200 },
    'ref-c': { w: 1000, h: 1000 },
  }

  const original = dims.buildChapterPageRatios(['ref-a', 'ref-b', 'ref-c'], map)
  assert.deepEqual(original, [1200 / 1800, 800 / 1200, 1], 'ratios must be w/h')

  // Pages reordered: each page must carry ITS OWN ratio.
  const reordered = dims.buildChapterPageRatios(['ref-c', 'ref-a', 'ref-b'], map)
  assert.deepEqual(reordered, [1, 1200 / 1800, 800 / 1200], 'ratios must move with the page when order changes')

  // A new page added at the start: everything after would shift in an indexed design.
  const inserted = dims.buildChapterPageRatios(['ref-yeni', 'ref-a', 'ref-b', 'ref-c'], map)
  assert.equal(inserted[0], null, 'an unknown page must be null')
  assert.equal(inserted[1], 1200 / 1800, 'pages after an insertion must not shift')
  assert.equal(inserted[3], 1)

  // A page deleted from the middle.
  const removed = dims.buildChapterPageRatios(['ref-a', 'ref-c'], map)
  assert.deepEqual(removed, [1200 / 1800, 1], 'silme sonrasi da dogru esleme')
}

// ---------- B) Broken data is cleaned ----------
{
  assert.deepEqual(dims.sanitizeChapterPageDimensionMap(null), {})
  assert.deepEqual(dims.sanitizeChapterPageDimensionMap('bozuk'), {})
  assert.deepEqual(dims.sanitizeChapterPageDimensionMap([1, 2]), {}, 'dizi kabul edilmemeli (sozluk bekleniyor)')

  const cleaned = dims.sanitizeChapterPageDimensionMap({
    ok: { w: 100, h: 200 },
    sifir: { w: 0, h: 200 },
    negatif: { w: -5, h: 10 },
    metin: { w: '100', h: '200' },
    eksik: { w: 100 },
    bos: null,
    '': { w: 10, h: 10 },
  })
  assert.deepEqual(Object.keys(cleaned), ['ok'], 'only valid entries must remain')
}

// ---------- C) Birlestirme mevcut bilgiyi korur ----------
{
  const existing = { 'ref-a': { w: 1200, h: 1800 } }
  const merged = dims.mergeChapterPageDimensionMap(existing, [
    { ref: 'ref-b', width: 800, height: 1200 },
    { ref: 'ref-bozuk', width: 0, height: 100 },
    { ref: '', width: 10, height: 10 },
  ])
  assert.deepEqual(merged['ref-a'], { w: 1200, h: 1800 }, 'info of an untouched page must not be lost')
  assert.deepEqual(merged['ref-b'], { w: 800, h: 1200 })
  assert.ok(!('ref-bozuk' in merged), 'an unmeasured page must not be written')
  assert.equal(Object.keys(merged).length, 2)

  // If the same page uploads again the new measure must overwrite the old.
  const replaced = dims.mergeChapterPageDimensionMap(merged, [{ ref: 'ref-a', width: 900, height: 900 }])
  assert.deepEqual(replaced['ref-a'], { w: 900, h: 900 })
}

// ---------- D) Records of deleted pages must not pile up ----------
{
  const pruned = dims.pruneChapterPageDimensionMap(
    { 'ref-a': { w: 1, h: 2 }, 'ref-eski': { w: 3, h: 4 } },
    ['ref-a'],
  )
  assert.deepEqual(Object.keys(pruned), ['ref-a'], 'unused records must be cleaned')
}

// ---------- E) Bos sozluk yerine null yazilir ----------
{
  assert.equal(dims.toStorableChapterPageDimensions({}), null, 'an empty dictionary must not accumulate as `{}` in the row')
  assert.notEqual(dims.toStorableChapterPageDimensions({ a: { w: 1, h: 1 } }), null)
}

// ---------- F) Migration and deploy order ----------
const migration = read('supabase/migrations/20260730120000_chapter_page_dimensions.sql')
assert.match(migration, /add column if not exists page_dimensions jsonb/i, 'the column must be ADDITIONAL and nullable')
assert.doesNotMatch(migration, /not null/i, 'the column must not be required: old chapters stay null')
assert.doesNotMatch(migration, /alter column pages|drop column pages/i, 'mevcut pages kolonuna DOKUNULMAMALI')
// Without a new policy/default the app_private wrapper rule does not apply;
// if one is added this pin breaks and the rule is reviewed on purpose.
const migrationBody = migration.replace(/^\s*--.*$/gm, '')
assert.doesNotMatch(migrationBody, /create policy|alter policy|default /i, 'this migration must not add a policy/default')

// If code ships before the migration, a chapter should open without space reservation, not fail to open:
// a missing column (42703) needs a fallback selection.
const detailsSource = read('src/services/mangaService/details.ts')
assert.match(detailsSource, /42703/, 'the missing column case must be handled (deploy order guard)')
assert.match(detailsSource, /CHAPTER_DETAIL_SELECT_WITHOUT_PAGE_DIMENSIONS/, 'kolonsuz yedek secim kullanilmali')

const sharedTypes = read('src/services/mangaService/shared.types.ts')
assert.match(sharedTypes, /page_dimensions/, 'okuma secimi kolonu icermeli')
assert.doesNotMatch(
  read('src/services/mangaService/shared.mappers.ts'),
  /row\.pages\s*\n?\s*\.filter[\s\S]{0,200}row\.pages\s*\n?\s*\.filter/,
  'the reference list must be extracted once: two separate filters risk index drift',
)

console.log('PASS chapter page dimensions contract verified')
