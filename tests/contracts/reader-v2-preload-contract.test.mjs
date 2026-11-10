/**
 * Reader v2 preload + space reservation contract (Phase 6).
 *
 * Pins two behaviors:
 * 1. Load priority is calculated from the READ position. It used to be
 * `index < 2 ? eager : lazy`: for a reader resuming from mid chapter
 * the first two pages got needless priority while neighbors of the read spot waited.
 * 2. Space is reserved for each page BEFORE loading. Measured in a browser
 * (2026-07-29): with space reserved, when an unloaded page loads the shell
 * scrollHeight goes 7239 -> 7239, so it DOES NOT CHANGE. Without a reservation this value
 * grew with each image and the read line shifted during auto scrolling.
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

const preload = loadModule('src/pages/reader/readerV2PreloadEngine.ts')

// ---------- A) Load priority follows the read position ----------
{
  const window = preload.READER_V2_PRELOAD_WINDOW
  assert.ok(window >= 1, 'at least one neighbor must preload')

  // Bolumun ORTASINDAN devam eden okuyucu: asil duzeltilen senaryo.
  const current = 10
  assert.equal(preload.resolveReaderV2PagePriority(10, current).loading, 'eager', 'the read page must load without waiting')
  assert.equal(preload.resolveReaderV2PagePriority(10, current).fetchPriority, 'high', 'only the read page has high priority')
  assert.equal(preload.resolveReaderV2PagePriority(12, current).loading, 'eager', 'the next neighbor must preload')
  assert.equal(preload.resolveReaderV2PagePriority(8, current).loading, 'eager', 'the previous neighbor must be ready for going back too')
  assert.equal(
    preload.resolveReaderV2PagePriority(0, current).loading,
    'lazy',
    'reading from the middle must not prioritize the first page (the old `index < 2` bug)',
  )
  assert.equal(preload.resolveReaderV2PagePriority(12, current).fetchPriority, 'auto', 'neighbors must not have high priority')

  // Window size must be configurable from outside.
  assert.equal(preload.resolveReaderV2PagePriority(15, 10, 5).loading, 'eager')
  assert.equal(preload.resolveReaderV2PagePriority(16, 10, 5).loading, 'lazy')
  assert.equal(preload.resolveReaderV2PagePriority(3, 0, 0).loading, 'lazy', 'with window 0 only the read page')
  assert.equal(preload.resolveReaderV2PagePriority(0, 0, 0).loading, 'eager')
}

// ---------- B) Yer ayirma oranlari ----------
{
  // Olculen deger bilinen degeri EZER: gercek gorselin orani her zaman dogrudur.
  const ratios = preload.resolveReaderV2AspectRatios({
    pageCount: 3,
    knownRatios: [0.5, 0.5, 0.5],
    measuredRatios: [0.75, null, undefined],
  })
  assert.equal(ratios[0], 0.75, 'a measured ratio must overwrite the stored one')
  assert.equal(ratios[1], 0.5, 'with no measure the stored ratio must be used')
  assert.equal(ratios[2], 0.5)
}

{
  // A page with no source at all falls to the MEDIAN: rendering at 0 height
  // breaks the scrollbar and auto scrolling.
  const ratios = preload.resolveReaderV2AspectRatios({
    pageCount: 4,
    knownRatios: [],
    measuredRatios: [0.6, 0.7, 0.8, null],
  })
  assert.equal(ratios[3], 0.7, 'an unknown page must take the median of known ones')
  assert.notEqual(ratios[3], 0, 'an unknown page must never stay at zero height')
}

{
  // Hicbir sey bilinmiyorsa sabit yedek: yine de yer ayrilir.
  const ratios = preload.resolveReaderV2AspectRatios({ pageCount: 2, knownRatios: [], measuredRatios: [] })
  assert.equal(ratios.length, 2)
  assert.equal(ratios[0], preload.READER_V2_FALLBACK_ASPECT_RATIO)
  assert.ok(ratios[0] > 0, 'the fallback ratio must be positive')
}

{
  // Bozuk olcumler (0, negatif, NaN) kabul edilmemeli.
  const ratios = preload.resolveReaderV2AspectRatios({
    pageCount: 4,
    knownRatios: [0, -1, Number.NaN, 0.9],
    measuredRatios: [Number.NaN, 0, -3, null],
  })
  assert.equal(ratios[3], 0.9, 'a valid stored ratio must be kept')
  assert.equal(ratios[0], 0.9, 'bozuk degerler medyana dusmeli')
  assert.ok(ratios.every((ratio) => ratio > 0), 'no ratio must be zero/negative')
}

// ---------- C) Baglanti katmani niyeti ----------
const pageSource = read('src/pages/reader/ReaderV2Page.tsx')
const stageContentSource = read('src/pages/reader/ReaderV2StageContent.tsx')
assert.match(pageSource, /<ReaderV2StageContent/, 'the stage must hand page loading to the dedicated component')
assert.doesNotMatch(
  stageContentSource,
  /loading=\{index < 2 \? 'eager' : 'lazy'\}/,
  'coarse load priority must not come back',
)
assert.match(stageContentSource, /resolveReaderV2PagePriority/, 'oncelik motordan gelmeli')
// React 18 does NOT RECOGNIZE the `fetchPriority` (camelCase) prop: the attribute is written to the DOM
// but prints a console warning for each image. It must be passed as a lowercase
// attribute. (Can go back to camelCase after moving to React 19.)
assert.doesNotMatch(stageContentSource, /fetchPriority=\{/, 'in React 18 camelCase fetchPriority fills the console with warnings')
assert.match(stageContentSource, /fetchpriority: priority\.fetchPriority/, 'the attribute must pass in lowercase')
assert.match(stageContentSource, /style=\{\{ aspectRatio: aspectRatios\[index\] \}\}/, 'space must be reserved in advance in the strip')
// Both modes must use the same engine (the single logic principle).
assert.equal(
  (stageContentSource.match(/resolveReaderV2PagePriority\(/g) || []).length,
  2,
  'strip and page modes must use the same priority engine',
)

console.log('PASS reader v2 preload + space reservation contract verified')
