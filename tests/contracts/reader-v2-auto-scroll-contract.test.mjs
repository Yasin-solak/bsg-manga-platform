/**
 * Reader v2 auto reading contract (Phase 3).
 *
 * Pins two real bugs reported by the user:
 * 1. "No motion at all at 60 px/s and below": without fractional accumulation,
 * low speeds were lost.
 * 2. "The upper limit can be raised": v1's ceiling of 400 was not enough.
 * Also pins horizontal mode auto reading, which v1 did NOT have.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

// Pure module loader: resolves the '@/...' alias so engines can really import each
// other (constants are shared, not copied).
const moduleCache = new Map()
function loadModule(relativePath) {
  if (moduleCache.has(relativePath)) return moduleCache.get(relativePath)
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  moduleCache.set(relativePath, shim.exports)
  const requireShim = (specifier) => {
    if (specifier.startsWith('@/')) return loadModule(`src/${specifier.slice(2)}.ts`)
    throw new Error(`The contract loader cannot resolve this import: ${specifier}`)
  }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, requireShim)
  return shim.exports
}

const prefs = loadModule('src/pages/reader/readerV2Preferences.ts')
const advance = loadModule('src/pages/reader/readerV2AutoAdvanceEngine.ts')
const strip = loadModule('src/pages/mangaReader/readerAutoScrollEngine.ts')

// ---------- A) Speed range: the two limits the user reported ----------
assert.ok(
  prefs.READER_V2_AUTO_SCROLL_SPEED_MIN <= 60,
  'users must be able to use 60 px/s and below: going under the v1 lower limit (30) is deliberate',
)
assert.ok(
  prefs.READER_V2_AUTO_SCROLL_SPEED_MAX > 400,
  'the upper limit must go above the v1 ceiling (400) (user request)',
)

{
  const { autoScrollSpeed: defaultSpeed, autoAdvanceSeconds: defaultSeconds } = prefs.DEFAULT_READER_V2_PREFERENCES
  assert.ok(Number.isFinite(defaultSpeed) && defaultSpeed > 0, 'the default speed must be numeric')

  const tooSlow = prefs.sanitizeReaderV2Preferences({ autoScrollSpeed: 1 })
  assert.equal(tooSlow.autoScrollSpeed, prefs.READER_V2_AUTO_SCROLL_SPEED_MIN, 'alt sinirin altina inilmemeli')

  const tooFast = prefs.sanitizeReaderV2Preferences({ autoScrollSpeed: 99999 })
  assert.equal(tooFast.autoScrollSpeed, prefs.READER_V2_AUTO_SCROLL_SPEED_MAX, 'ust sinir asilmamali')

  const garbage = prefs.sanitizeReaderV2Preferences({ autoScrollSpeed: 'hizli' })
  assert.equal(garbage.autoScrollSpeed, defaultSpeed, 'a non-numeric value must fall to the default')

  const stepped = prefs.sanitizeReaderV2Preferences({ autoScrollSpeed: 87 })
  assert.equal(
    stepped.autoScrollSpeed % prefs.READER_V2_AUTO_SCROLL_SPEED_STEP,
    0,
    'speed must sit on a step (slider and keyboard must produce the same values)',
  )

  assert.equal(
    prefs.sanitizeReaderV2Preferences({ autoAdvanceSeconds: 0 }).autoAdvanceSeconds,
    prefs.READER_V2_AUTO_ADVANCE_MIN_SECONDS,
    'page duration cannot be 0: pages would flow before being seen',
  )
  assert.equal(
    prefs.sanitizeReaderV2Preferences({ autoAdvanceSeconds: 500 }).autoAdvanceSeconds,
    prefs.READER_V2_AUTO_ADVANCE_MAX_SECONDS,
    'page duration must stay at the upper limit',
  )
  assert.equal(
    prefs.sanitizeReaderV2Preferences({}).autoAdvanceSeconds,
    defaultSeconds,
    'a missing field must fall to the default',
  )
}

// ---------- B) Low speed must really progress (the main bug) ----------
/**
 * Root cause: the browser snaps `element.scrollTop` to whole pixels. Measured in a real DOM on 2026-07-29:
 * writing `scrollTop = 0.5` and reading back returns **1**
 * (Chromium rounds to nearest), `scrollTop = 7.25` -> **7**.
 *
 * If position is read back from the DOM each frame the result is BROKEN whatever the rounding:
 * - in an engine rounding down, sub-pixel per-frame progress is lost -> speed DEAD
 * (the user's "no motion at all at 60 and below"),
 * - rounding to nearest inflates to 1px per frame -> a MULTIPLE of the wanted speed.
 * Both models are pinned here; the only right fix: accumulate position as a fraction in JS
 * and write to the DOM without reading back.
 */
{
  const FRAME_MS = 1000 / 60
  const runOneSecond = (speed, quantize) => {
    let position = 0
    let settledFrames = 0
    let lastScrollHeight = 20000
    for (let frame = 0; frame < 60; frame += 1) {
      const result = strip.computeAutoScrollFrame({
        scrollTop: position,
        scrollHeight: 20000,
        clientHeight: 800,
        speed,
        deltaMs: FRAME_MS,
        lastScrollHeight,
        settledFrames,
      })
      settledFrames = result.settledFrames
      lastScrollHeight = result.lastScrollHeight
      if (result.nextScrollTop !== null) {
        position = quantize ? quantize(result.nextScrollTop) : result.nextScrollTop
      }
    }
    return position
  }

  assert.equal(
    runOneSecond(30, Math.floor),
    0,
    'with a rounding-down read-back 30 px/s never progresses (reported bug)',
  )
  assert.ok(
    runOneSecond(30, Math.round) > 45,
    'with a nearest-rounding read-back 30 px/s rises to a multiple of the wanted speed (measured Chromium behavior)',
  )
  assert.ok(
    Math.abs(runOneSecond(30, null) - 30) < 1,
    'with fractional accumulation 30 px/s must progress ~30px in a second',
  )
  assert.ok(Math.abs(runOneSecond(60, null) - 60) < 1, '60 px/s must flow right too (the threshold the user reported)')
  assert.ok(Math.abs(runOneSecond(600, null) - 600) < 2, 'the new upper limit must flow at the right speed too')
}

// ---------- C) Sayfa modu otomatik ilerleme motoru ----------
{
  const base = { intervalMs: 6000, atEnd: false }

  const waiting = advance.computeReaderV2PageAdvance({ ...base, elapsedMs: 0, deltaMs: 16 })
  assert.equal(waiting.shouldAdvance, false, 'the page must not turn before time is up')
  assert.equal(waiting.elapsedMs, 16, 'elapsed time must accumulate')

  const due = advance.computeReaderV2PageAdvance({ ...base, elapsedMs: 5990, deltaMs: 16 })
  assert.equal(due.shouldAdvance, true, 'the page must turn when time is up')
  assert.equal(due.elapsedMs, 0, 'the counter must reset after turning')
  assert.equal(due.shouldStop, false)

  const atEnd = advance.computeReaderV2PageAdvance({ ...base, elapsedMs: 5990, deltaMs: 16, atEnd: true })
  assert.equal(atEnd.shouldAdvance, false, 'must not go forward on the last page')
  assert.equal(atEnd.shouldStop, true, 'auto reading must close on the last page')

  // Should close when time is up, not as soon as it reaches the last page.
  const atEndEarly = advance.computeReaderV2PageAdvance({ ...base, elapsedMs: 0, deltaMs: 16, atEnd: true })
  assert.equal(atEndEarly.shouldStop, false, 'the last page must also show for the full time')

  // Tab return: tens of accumulated seconds should not skip pages.
  const tabReturn = advance.computeReaderV2PageAdvance({ ...base, elapsedMs: 0, deltaMs: 30000 })
  assert.equal(
    tabReturn.elapsedMs,
    strip.AUTO_SCROLL_MAX_FRAME_MS,
    'delta must be clipped on return from background (same constant as the strip engine)',
  )
  assert.equal(tabReturn.shouldAdvance, false, 'no bulk page skip on tab return')

  const negative = advance.computeReaderV2PageAdvance({ ...base, elapsedMs: 100, deltaMs: -500 })
  assert.equal(negative.elapsedMs, 100, 'a negative delta must not roll time back')
}

// ---------- C2) Response to manual scrolling ----------
// User rule: with auto reading on, scrolling UP stops, scrolling DOWN continues.
// Going back means "stop"; going forward means
// "I want to move faster".
{
  const react = (expected, actual) => advance.resolveReaderV2ManualScroll({
    expectedPosition: expected, actualPosition: actual,
  })
  const tolerance = advance.READER_V2_MANUAL_SCROLL_TOLERANCE_PX

  assert.equal(react(1000, 1000), 'continue', 'motorun kendi yazdigi konumda devam edilmeli')
  assert.equal(react(1000, 1000 + tolerance), 'continue', 'tolerans icindeki fark elle kaydirma sayilmamali')
  assert.equal(react(1000, 900), 'stop', 'yukari kaydirma otomatik okumayi durdurmali')
  assert.equal(react(1000, 1100), 'resync', 'asagi kaydirma durdurmamali, konum senkronlanmali')
  assert.equal(react(1000, 1000 - tolerance), 'continue', 'a small back drift must not stop it (rounding margin)')
  assert.equal(react(0, 0), 'continue', 'no unexpected stop at chapter start')
}

// ---------- C3) Backward scrolling in page mode should stop too ----------
// This branch used to return EARLY: "pull back to stop" never worked in horizontal mode.
// Since we do not write the position in page mode, the rule is based on the furthest point reached.
{
  const stop = (position, furthest, viewportSize = 1000) =>
    advance.shouldStopReaderV2PageAdvance({ position, furthestPosition: furthest, viewportSize })
  const ratio = advance.READER_V2_PAGE_BACKWARD_STOP_RATIO

  assert.equal(stop(1000, 1000), false, 'ileri giderken durmamali')
  assert.equal(stop(1000, 1100), false, 'a small move during snap must not stop it')
  assert.equal(stop(0, 1000), true, 'belirgin geri hareket durdurmali')
  assert.equal(stop(1000 - ratio * 1000 - 1, 1000), true, 'esigin uzerinde durmali')
  assert.equal(stop(1000 - ratio * 1000, 1000), false, 'tam esikte durmamali (kenar belirsiz kalmasin)')
  assert.equal(stop(500, 1000, 0), false, 'no decision without a measure')
}

// Dokunmatik gurultusu bosuna durdurmamali: tolerans yuvarlama payinin cok
// uzerinde ama kasitli hareketin cok altinda olmali.
assert.ok(
  advance.READER_V2_MANUAL_SCROLL_TOLERANCE_PX >= 8,
  'dokunmatik lastik-bant/momentum geri tepmesi otomatigi durdurmamali',
)
assert.ok(
  advance.READER_V2_MANUAL_SCROLL_TOLERANCE_PX <= 40,
  'tolerance must stay small enough not to miss a deliberate upward scroll',
)

// ---------- C4) WAITING on an unloaded page ----------
// Space reservation (aspect-ratio) solved jumping but caused a side effect: on a slow
// connection at high speed it could flow over empty gray boxes.
{
  const hold = (hasPendingImage, heldMs = 0, deltaMs = 16) =>
    advance.resolveReaderV2AutoScrollHold({ hasPendingImage, heldMs, deltaMs })

  assert.equal(hold(false).hold, false, 'no waiting if the page is ready')
  assert.equal(hold(false, 3000).heldMs, 0, 'the wait counter must reset when the page arrives')
  assert.equal(hold(true).hold, true, 'must wait on an unloaded page')
  assert.equal(hold(true, 100).heldMs, 116, 'wait time must accumulate')

  // Sonsuz bekleme YOK: kirik gorsel okumayi kilitlememeli.
  const max = advance.READER_V2_AUTO_SCROLL_MAX_HOLD_MS
  assert.equal(hold(true, max).hold, false, 'ust sinire ulasinca devam edilmeli')
  assert.ok(max > 0 && max <= 15000, 'the upper limit must be reasonable (no lockup, no endless wait)')

  // Accumulated delta on tab return should not use up the wait time at once.
  assert.equal(
    hold(true, 0, 30000).heldMs,
    strip.AUTO_SCROLL_MAX_FRAME_MS,
    'the wait counter must also grow with the clipped delta',
  )
}

// ---------- D) Baglanti katmani niyeti ----------
const hookSource = read('src/pages/reader/useReaderV2AutoScroll.ts')

assert.match(
  hookSource,
  /from '@\/pages\/mangaReader\/readerAutoScrollEngine'/,
  'the strip engine must be SHARED with v1: a second copy means two separate bug surfaces',
)
assert.match(hookSource, /computeReaderV2PageAdvance/, 'auto reading must work in horizontal mode (v1 had none)')
// Fractional accumulation: engine input should come from accumulated position, not the DOM.
assert.doesNotMatch(
  hookSource,
  /scrollTop: element\.scrollTop/,
  'position must not be read back from the DOM each frame: this was the root of the 60 px/s bug',
)
// Manual scroll detection moved to the pure engine (up -> stop, down -> continue);
// the hook only provides measurement and applies the result.
assert.match(
  hookSource,
  /expectedPosition: position/,
  'the manual scroll decision must use the position the engine expects',
)
assert.match(
  hookSource,
  /actualPosition: element\.scrollTop/,
  'for comparison the shell REAL position must be read',
)
assert.match(hookSource, /visibilitychange/, 'the timer must reset on tab return')
assert.match(hookSource, /speedRef\.current/, 'a speed change must not rebuild the rAF loop')
assert.match(hookSource, /resolveReaderV2ManualScroll/, 'elle kaydirma tepkisi saf motordan gelmeli')
assert.match(hookSource, /shouldStopReaderV2PageAdvance/, 'backward scrolling must stop in page mode too')
assert.match(hookSource, /resolveReaderV2AutoScrollHold/, 'must wait on an unloaded page')
assert.match(hookSource, /image\.complete/, 'whether the page loaded must really be measured')
// Waiting must exist in both modes (strip + page).
assert.equal(
  (hookSource.match(/resolveReaderV2AutoScrollHold\(\{/g) || []).length,
  2,
  'waiting must apply in both strip and page modes',
)


const pageSource = read('src/pages/reader/ReaderV2Page.tsx')
assert.match(pageSource, /data-testid="reader-v2-autoscroll-toggle"/, 'auto reading toggle must be visible')

const controlsSource = read('src/pages/reader/useReaderV2Controls.ts')
assert.match(controlsSource, /onToggleAutoScroll\(\)/, 'klavyeden otomatik okuma acilabilmeli')

const panelSource = read('src/pages/reader/ReaderV2SettingsPanel.tsx')
assert.match(panelSource, /READER_V2_AUTO_SCROLL_SPEED_MAX/, 'panel limits must come from the model (not a handwritten number)')
assert.match(panelSource, /autoAdvanceSeconds/, 'duration setting must be offered in page mode too')

console.log('PASS reader v2 auto reading contract verified')
