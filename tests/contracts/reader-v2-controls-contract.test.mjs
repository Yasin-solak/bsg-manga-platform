/**
 * Reader v2 controls + preference model contract (Phase 2).
 *
 * The preference model is pure, so it is verified with REAL behavior tests;
 * on the control/panel side intent is pinned (for parts not measurable
 * without a browser).
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
  // The preference model uses only type imports; no require needed.
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, () => ({}))
  return shim.exports
}

const prefs = loadModule('src/pages/reader/readerV2Preferences.ts')

// ---------- A) v1 ayarlariyla KARISMAZ ----------
assert.equal(
  prefs.READER_V2_PREFERENCES_STORAGE_KEY,
  'reader-preferences:v2',
  'v2 must use its own storage key: settings must not leak while comparing the two readers side by side',
)
const v1Source = read('src/services/readerPreferencesService.ts')
assert.match(v1Source, /READER_PREFERENCES_STORAGE_KEY = 'reader-preferences:v1'/, 'v1 anahtari degismemeli')

// ---------- B) Tercih modeli davranisi ----------
{
  const defaults = prefs.DEFAULT_READER_V2_PREFERENCES
  assert.equal(defaults.modePreference, 'auto', 'the default must be automatic (decided by content)')
  // The "immersive" preference was REMOVED: bars now hide with page motion without a separate setting
  // (readerV2ChromeEngine). Returning as a preference is the step the user wanted removed.
  assert.ok(!('immersive' in defaults), 'quiet reading must not come back as a separate preference')
}

// Broken/missing data falls to defaults (localStorage may be polluted).
{
  assert.deepEqual(prefs.sanitizeReaderV2Preferences(null), prefs.DEFAULT_READER_V2_PREFERENCES)
  assert.deepEqual(prefs.sanitizeReaderV2Preferences('bozuk'), prefs.DEFAULT_READER_V2_PREFERENCES)
  const partial = prefs.sanitizeReaderV2Preferences({ modePreference: 'gecersiz', zoomLevel: 999, seamless: 'evet' })
  assert.equal(partial.modePreference, 'auto', 'an invalid mode must fall to the default')
  assert.equal(partial.zoomLevel, 100, 'a zoom not on the list must fall to the default')
  assert.equal(partial.seamless, false, 'a non-boolean value must fall to the default')
}

// Gecerli degerler korunur.
{
  // Rules of auto reading fields are in a separate contract
  // (reader-v2-auto-scroll-contract); here only their presence in the shape is pinned:
  // an unsanitized field must not leak.
  const valid = prefs.sanitizeReaderV2Preferences({
    modePreference: 'strip', fitMode: 'height', seamless: true, zoomLevel: 150,
    autoScrollSpeed: 120, autoAdvanceSeconds: 8,
  })
  assert.deepEqual(valid, {
    modePreference: 'strip', fitMode: 'height', seamless: true, zoomLevel: 150,
    autoScrollSpeed: 120, autoAdvanceSeconds: 8,
  })
}

// Merge changes only the given field.
{
  const merged = prefs.mergeReaderV2Preferences(prefs.DEFAULT_READER_V2_PREFERENCES, { modePreference: 'page' })
  assert.equal(merged.modePreference, 'page')
  assert.equal(merged.zoomLevel, prefs.DEFAULT_READER_V2_PREFERENCES.zoomLevel, 'an untouched field must be kept')
}

// The zoom step stops at the limit (no overflow).
{
  const levels = prefs.READER_V2_ZOOM_LEVELS
  assert.equal(prefs.stepReaderV2Zoom(levels[0], -1), levels[0], 'en dusuk zoom altina inilmemeli')
  assert.equal(prefs.stepReaderV2Zoom(levels[levels.length - 1], 1), levels[levels.length - 1], 'en yuksek zoom asilmamali')
  assert.equal(prefs.stepReaderV2Zoom(100, 1), 115, 'must go up one step')
}

// ---------- C) Kontrol katmani niyeti ----------
const controlsSource = read('src/pages/reader/useReaderV2Controls.ts')
// Keyboard shortcuts should not fire in text fields (the space key should not turn pages
// while writing a comment).
assert.match(
  controlsSource,
  /\['INPUT', 'TEXTAREA', 'SELECT'\]\.includes\(target\.tagName\)/,
  'shortcuts must be suppressed in text fields',
)
assert.match(controlsSource, /isContentEditable/)
// Commands must run on ONE container by axis.
assert.match(controlsSource, /layout\.axis === 'x'/, 'commands must run on the same container by axis')
assert.match(controlsSource, /requestFullscreen/)

const pageSource = read('src/pages/reader/ReaderV2Page.tsx')
// Touch zones must be calculated from position: v1 used invisible button layers and
// overflowing images could swallow clicks.
assert.match(pageSource, /const ratio = \(event\.clientX - bounds\.left\)/, 'the touch zone must be computed from position')
assert.doesNotMatch(
  pageSource,
  /absolute inset-y-0 (left|right)-0 z-10 w-\[18%\]/,
  'the v1 invisible click layer pattern must not move to v2',
)

const panelSource = read('src/pages/reader/ReaderV2SettingsPanel.tsx')
assert.match(panelSource, /data-testid="reader-v2-settings"/)
// Panel dar ekranda kirpilmamali: telefonda alttan cekmece, masaustunde yan panel.
assert.match(panelSource, /sm:right-0 sm:w-80/, 'desktop must have a side panel')
assert.match(panelSource, /inset-x-0 bottom-0/, 'phones must have a bottom drawer')

console.log('PASS reader v2 controls + preference contract verified')
