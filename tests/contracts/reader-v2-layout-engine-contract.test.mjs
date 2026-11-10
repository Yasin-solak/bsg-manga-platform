/**
 * Reader v2 layout engine behavior contract (Phase 1).
 *
 * NOT a regex pin but a real behavior test: the engine is pure, so it is simulated measure by measure.
 * v1's root problem was scattering the layout decision over two JSX trees;
 * these tests keep it in one place and measurable.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const source = readFileSync(path.join(rootDir, 'src/pages/reader/readerV2LayoutEngine.ts'), 'utf8')

// Types are stripped with the REAL compiler, not regex: even an ordinary signature like `number[]`
// broke the regex approach and caused a false red test. typescript is already a devDependency.
function loadEngine() {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const moduleShim = { exports: {} }
  const factory = new Function('module', 'exports', outputText)
  factory(moduleShim, moduleShim.exports)
  return moduleShim.exports
}

const {
  resolveReaderV2Layout,
  computeReaderV2Progress,
  pageIndexToScrollOffset,
  READER_V2_DOUBLE_PAGE_MIN_WIDTH,
} = loadEngine()

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

const base = {
  viewport: DESKTOP,
  modePreference: 'auto',
  fitMode: 'width',
  seamless: false,
}

// --- 1) Webtoon strip content picks STRIP mode automatically ---
{
  const layout = resolveReaderV2Layout({ ...base, pageAspects: [4.2, 5.1, 3.8] })
  assert.equal(layout.mode, 'strip', 'long strip content must read in strip mode')
  assert.equal(layout.axis, 'y')
  assert.equal(layout.snap, 'none')
  assert.equal(layout.gapPx, 0, 'a webtoon strip must flow seamlessly (no panel split)')
}

// --- 2) A classic manga page picks PAGE mode automatically ---
{
  const layout = resolveReaderV2Layout({ ...base, pageAspects: [1.45, 1.42, 1.5] })
  assert.equal(layout.mode, 'page', 'a classic page ratio must read in page mode')
  assert.equal(layout.axis, 'x')
  assert.equal(layout.snap, 'mandatory', 'page mode must stop page by page with snap')
}

// --- 3) Kullanici tercihi otomatik karardan USTUNDUR ---
{
  const forcedStrip = resolveReaderV2Layout({ ...base, pageAspects: [1.4], modePreference: 'strip' })
  assert.equal(forcedStrip.mode, 'strip')
  assert.equal(forcedStrip.autoResolved, false)

  const forcedPage = resolveReaderV2Layout({ ...base, pageAspects: [5], modePreference: 'page' })
  assert.equal(forcedPage.mode, 'page')
  assert.equal(forcedPage.autoResolved, false)
}

// --- 4) Double page only on wide and landscape screens ---
{
  const wide = resolveReaderV2Layout({ ...base, pageAspects: [1.45] })
  assert.equal(wide.perView, 2, 'double page must open on wide desktop')

  const phone = resolveReaderV2Layout({ ...base, pageAspects: [1.45], viewport: PHONE })
  assert.equal(phone.perView, 1, 'phones must have a single page')

  const narrowLandscape = resolveReaderV2Layout({
    ...base,
    pageAspects: [1.45],
    viewport: { width: READER_V2_DOUBLE_PAGE_MIN_WIDTH - 1, height: 700 },
  })
  assert.equal(narrowLandscape.perView, 1, 'double page must not open below the threshold')
}

// --- 5) Without measures strip is assumed (the safe side) ---
{
  const unknown = resolveReaderV2Layout({ ...base, pageAspects: [] })
  assert.equal(unknown.mode, 'strip', 'with an unknown measure strip is the safe default')
}

// --- 6) Seamless tercihi klasik seritte de boslugu kaldirir ---
{
  const spaced = resolveReaderV2Layout({ ...base, pageAspects: [1.4], modePreference: 'strip' })
  assert.equal(spaced.gapPx > 0, true, 'in a classic strip a gap marks the page boundary')

  const seamless = resolveReaderV2Layout({ ...base, pageAspects: [1.4], modePreference: 'strip', seamless: true })
  assert.equal(seamless.gapPx, 0, 'if the user wants it seamless the gap must go')
}

// --- 7) Ilerleme: dikey eksen ---
{
  const layout = resolveReaderV2Layout({ ...base, pageAspects: [4] })
  const progress = computeReaderV2Progress(layout, {
    scrollTop: 500, scrollLeft: 0, scrollHeight: 1800, scrollWidth: 800,
    clientHeight: 800, clientWidth: 800,
  }, 10)
  assert.equal(Math.round(progress.percent), 50, 'vertical progress must be computed from the scrollTop ratio')
  assert.ok(progress.pageIndex >= 0 && progress.pageIndex < 10)
}

// --- 8) Progress: horizontal axis + page index (including double page) ---
{
  const layout = resolveReaderV2Layout({ ...base, pageAspects: [1.45] })
  assert.equal(layout.perView, 2)
  const progress = computeReaderV2Progress(layout, {
    scrollTop: 0, scrollLeft: 1440, scrollHeight: 900, scrollWidth: 4320,
    clientHeight: 900, clientWidth: 1440,
  }, 6)
  assert.equal(progress.pageIndex, 2, 'in double page the second screen starts at page 3 (index 2)')
  assert.ok(progress.percent > 0 && progress.percent < 100)
}

// --- 9) With no content to scroll progress is 100% (the chapter fits the screen) ---
{
  const layout = resolveReaderV2Layout({ ...base, pageAspects: [4] })
  const progress = computeReaderV2Progress(layout, {
    scrollTop: 0, scrollLeft: 0, scrollHeight: 700, scrollWidth: 800,
    clientHeight: 800, clientWidth: 800,
  }, 3)
  assert.equal(progress.percent, 100)
}

// --- 10) Scroll position from page index (to keep the place on mode change) ---
{
  const layout = resolveReaderV2Layout({ ...base, pageAspects: [1.45] })
  assert.equal(pageIndexToScrollOffset(layout, 2, 1440), 1440, 'in double page page 3 is on the second screen')
  assert.equal(pageIndexToScrollOffset(layout, 0, 1440), 0)

  const strip = resolveReaderV2Layout({ ...base, pageAspects: [4] })
  assert.equal(pageIndexToScrollOffset(strip, 5, 1440), 0, 'horizontal position is not used in strip mode')
}

console.log('PASS reader v2 layout engine behavior contract verified (10 scenarios)')
