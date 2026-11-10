/**
 * Reader v2 shell (chrome) contract: user UI feedback 2026-07-30.
 *
 * Pinned decisions:
 * 1. Bars hide with PAGE MOTION; no separate "quiet reading" preference.
 * 2. Previous/auto/next in ONE CENTER cluster on the bottom bar (not spread to both ends of the screen).
 * 3. The header has a chapter PICKER (it used to be only text).
 * 4. Exit paths from the header: series + home + translating team.
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

const chrome = loadModule('src/pages/reader/readerV2ChromeEngine.ts')

// ---------- A) Bar gorunurlugu hareketin YONUNE bagli ----------
{
  const threshold = chrome.READER_V2_CHROME_MOVE_THRESHOLD_PX
  const base = { barsHidden: false, forceVisible: false }

  const forward = chrome.resolveReaderV2Chrome({ ...base, position: threshold + 10, lastPosition: 0 })
  assert.equal(forward.barsHidden, true, 'bars must retract while reading forward')
  assert.equal(forward.lastPosition, threshold + 10, 'karsilastirma konumu ilerlemeli')

  const backward = chrome.resolveReaderV2Chrome({
    position: 0, lastPosition: threshold + 10, barsHidden: true, forceVisible: false,
  })
  assert.equal(backward.barsHidden, false, 'bars must come back on scroll up (the user is looking for something)')

  // Kucuk oynamalar hicbir sey degistirmemeli (dokunmatik titremesi).
  const jitter = chrome.resolveReaderV2Chrome({
    position: threshold - 1, lastPosition: 0, barsHidden: false, forceVisible: false,
  })
  assert.equal(jitter.barsHidden, false)
  assert.equal(jitter.lastPosition, 0, 'below the threshold the comparison point must not shift (accumulation is kept)')

  const jitterWhileHidden = chrome.resolveReaderV2Chrome({
    position: 5, lastPosition: 0, barsHidden: true, forceVisible: false,
  })
  assert.equal(jitterWhileHidden.barsHidden, true, 'below the threshold the current state must be kept')
}

// forceVisible overrides everything and refreshes the position.
{
  const forced = chrome.resolveReaderV2Chrome({
    position: 900, lastPosition: 0, barsHidden: true, forceVisible: true,
  })
  assert.equal(forced.barsHidden, false, 'bars must show while panel/picker/chapter end is open')
  assert.equal(
    forced.lastPosition,
    900,
    'position must refresh: closing a panel must not produce a fake big move',
  )
}

// ---------- B) Ayri "sessiz okuma" tercihi geri gelmemeli ----------
const prefsSource = read('src/pages/reader/readerV2Preferences.ts')
assert.doesNotMatch(prefsSource, /immersive/, 'quiet reading preference was removed (behavior is the default)')
const panelSource = read('src/pages/reader/ReaderV2SettingsPanel.tsx')
assert.doesNotMatch(panelSource, /aria-label="Sessiz okuma"/, 'the panel must have no quiet reading switch')

// ---------- C) Bottom bar: controls in one center cluster ----------
const pageSource = read('src/pages/reader/ReaderV2Page.tsx')
assert.match(pageSource, /data-testid="reader-v2-footer-controls"/, 'bottom bar controls must be in one cluster')
for (const testId of ['reader-v2-prev-chapter', 'reader-v2-autoscroll-toggle', 'reader-v2-next-chapter']) {
  assert.match(pageSource, new RegExp(`data-testid="${testId}"`), `${testId} must be on the bottom bar`)
}
// Kume ORTALANMALI: alt bar artik uclara dagitan justify-between kullanmamali.
const footerBlock = pageSource.slice(pageSource.indexOf('data-testid="reader-v2-footer"'))
assert.doesNotMatch(
  footerBlock.slice(0, 400),
  /justify-between/,
  'previous/next must not spread to both screen edges (user feedback)',
)
assert.match(footerBlock.slice(0, 400), /flex-col items-center/, 'alt bar icerigi ortalanmali')

// ---------- D) Baslik: secici + cikis yollari ----------
assert.match(pageSource, /<ReaderV2ChapterPicker/, 'the header must have a chapter picker')
for (const testId of ['reader-v2-home', 'reader-v2-back-manga']) {
  assert.match(pageSource, new RegExp(`data-testid="${testId}"`), `${testId} must be in the header`)
}
assert.match(pageSource, /data-testid="reader-v2-fansub-link"/, 'there must be a path to the translating team')

const pickerSource = read('src/pages/reader/ReaderV2ChapterPicker.tsx')
assert.match(pickerSource, /role="listbox"/, 'the picker must be accessible')
assert.match(pickerSource, /scrollIntoView\(\{ block: 'center' \}\)/, 'the read chapter must stand out on open')
// The list must be ABOVE the reader shell (z-9000), or it is never visible.
const listZ = Number(pickerSource.match(/z-\[(\d+)\][^"]*"\s*\n?\s*>/)?.[1]
  ?? pickerSource.match(/z-\[(\d+)\]/g)?.map((m) => Number(m.match(/\d+/)[0])).sort((a, b) => b - a)[0])
assert.ok(listZ > 9000, `the picker list must be above the reader shell (found: ${listZ})`)

// ---------- E) Side rail: REAL SPACE, not MODE ----------
// The first version drew the rail only in page mode. A user's screenshot disproved it:
// at 1920px STRIP mode also has 405/415px empty edges and the rail was not showing. The decision is
// tied to measurement.
{
  const min = chrome.READER_V2_SIDE_RAIL_MIN_GUTTER_PX
  const show = (viewportWidth, contentWidth, barsVisible = true) =>
    chrome.shouldShowReaderV2SideRail({ viewportWidth, contentWidth, barsVisible })

  assert.equal(show(1920, 1100), true, 'on wide screens the rail must fit beside the strip column')
  assert.equal(show(1920, 1910), false, 'yakinlastirma icerigi buyutunce ray cekilmeli')
  assert.equal(show(1280, 1100), (1280 - 1100) / 2 >= min, 'the decision must be consistent with the threshold')
  assert.equal(show(800, 780), false, 'no rail on narrow screens')
  assert.equal(show(1920, 1100, false), false, 'barlar gizliyken ray da gizlenmeli')
  assert.equal(show(1920, 0), false, 'no rail without a measure (first frame)')

  // Tam esikte: siniri belirsiz birakma.
  assert.equal(show(1000, 1000 - 2 * min), true, 'the threshold value must be inclusive')
  assert.equal(show(1000, 1000 - 2 * min + 2), false, 'esigin altinda cizilmemeli')
}

const railSource = read('src/pages/reader/ReaderV2SideRail.tsx')
assert.match(railSource, /hidden/, 'must hide on narrow screens (not overlap content)')
assert.match(
  pageSource,
  /visible=\{shouldShowReaderV2SideRail\(\{/,
  'the side rail decision must come from the measuring engine (not pinned by mode)',
)

// ---------- F) The shell must set its OWN theme ----------
// The shell is always dark; but Button ghost/outline/secondary and the scrollbar take colors from
// THEME variables. On a light theme this produced white boxes on the dark bar
// (the fansub badge in a user's screenshot).
assert.match(
  pageSource,
  /className="dark fixed inset-0 z-\[9000\]/,
  'the reader shell must be under dark scope (shared components read theme variables)',
)
assert.equal(
  (pageSource.match(/data-testid="reader-v2-shell"/g) || []).length,
  (pageSource.match(/className="dark fixed inset-0/g) || []).length,
  'loading/error shells must be under the same theme too',
)
assert.match(pageSource, /colorScheme: 'dark'/, 'the scrollbar must be dark too')

// ---------- G) Bars are ON TOP, not IN FLOW ----------
// User: "they do not hide, only the buttons go; there is still a black block at top and bottom".
// Cause: bars were flex children and kept taking space when hidden. Overlaid, the stage
// fills the full height and hiding really gives full screen. Content also does not reflow,
// so the read spot does not shift.
assert.match(pageSource, /absolute inset-x-0 top-0 z-\[9010\]/, 'ust bar bindirilmeli (akista yer kaplamamali)')
assert.match(pageSource, /absolute inset-x-0 bottom-0 z-\[9010\]/, 'alt bar bindirilmeli')
assert.doesNotMatch(pageSource, /flex shrink-0 items-center justify-between gap-3 border-b/, 'the top bar must not come back as a flow child')
// The slide uses an inline style: the `-translate-y-full` utility had no effect on this element
// (the variable was right, `translate` was not applied).
assert.match(pageSource, /transform: barsVisible \? 'none' : 'translateY\(-100%\)'/, 'ust bar yukari cekilmeli')
assert.match(pageSource, /transform: barsVisible \? 'none' : 'translateY\(100%\)'/, 'alt bar asagi cekilmeli')

// ---------- H) Content must really be centered ----------
// The scrollbar takes space on one side, shifting content half a bar left
// (measured: 405 / 415).
assert.match(pageSource, /scrollbarGutter: 'stable both-edges'/, 'the scrollbar must reserve space on both sides')

// ---------- I) Hiz kontrolu oynatmanin yaninda ----------
assert.match(pageSource, /<ReaderV2SpeedStepper/, 'the speed control must be on the bottom bar')
const stepperSource = read('src/pages/reader/ReaderV2SpeedStepper.tsx')
assert.match(stepperSource, /data-testid="reader-v2-speed-stepper"/)
assert.match(stepperSource, /autoAdvanceSeconds/, 'duration must be adjustable in page mode')
assert.match(stepperSource, /autoScrollSpeed/, 'speed must be adjustable in strip mode')
// Limits must come from the model (not a handwritten number).
assert.match(stepperSource, /READER_V2_AUTO_SCROLL_SPEED_MAX/)
assert.match(stepperSource, /READER_V2_AUTO_ADVANCE_MIN_SECONDS/)

// ---------- J) Yan rayda ad gorunmeli ----------
assert.match(railSource, /group-hover\/rail:block/, 'the rail button name must show on hover')

// ---------- K) Header order: home -> team -> series ----------
const headerBlock = pageSource.slice(
  pageSource.indexOf('data-testid="reader-v2-header"'),
  pageSource.indexOf('<ReaderV2ChapterPicker'),
)
const order = ['reader-v2-home', 'reader-v2-fansub-link', 'reader-v2-back-manga']
  .map((id) => headerBlock.indexOf(id))
assert.ok(order.every((index) => index > -1), 'all three exit paths must be in the header')
assert.deepEqual([...order].sort((a, b) => a - b), order, 'order: home -> translating team -> series (user request)')

// ---------- L) Bottom bar simplified ----------
// User: remove the page counter, percent and progress bar. They added nothing to decisions while reading
// and swelled the bottom bar.
assert.doesNotMatch(pageSource, /data-testid="reader-v2-progress"/, 'the progress bar must not be on the bottom bar')
assert.doesNotMatch(pageSource, /%\{Math\.round\(progress\.percent\)\}/, 'yuzde gostergesi kaldirilmali')
// Progress calculation MUST STAY: the preload window depends on the read page index.
assert.match(pageSource, /computeReaderV2Progress/, 'the progress calculation must stay (preload relies on it)')
assert.match(pageSource, /progress\.pageIndex/, 'the read page index must still be used')

// ---------- M) Header must center on the screen ----------
// With `justify-between` the middle element shifted by the widths of left/right clusters
// (measured: ~125px right of center at 1920px).
// Absolute centering only on WIDE screens: on narrow screens it overlapped the left cluster
// (measured at 375px, 9px overlap). On mobile it stays in flow.
assert.match(
  pageSource,
  /md:pointer-events-none md:absolute md:inset-x-0/,
  'the header must center with absolute position on wide screens',
)
assert.match(
  pageSource,
  /flex min-w-0 flex-1 justify-center/,
  'on narrow screens the header must stay in flow (not clash with the left cluster)',
)

// ---------- N) Bolum sirasi etiketi kaldirildi ----------
assert.doesNotMatch(pickerSource, /position\?\./, 'chapter order (1/4) must not show')
assert.doesNotMatch(pageSource, /chapterPosition/, 'an unused order value must not travel on the page')

// ---------- O) Different fansub versions of a chapter must be selectable ----------
// Chapters are the uploading fansub's version; several teams can translate the same number.
// The picker first showed ONE row per number and readers could not switch.
assert.match(pickerSource, /data-testid="reader-v2-chapter-versions-toggle"/, 'coklu surum acilabilmeli')
assert.match(pickerSource, /data-testid="reader-v2-chapter-versions"/, 'surumler listelenmeli')
assert.match(pickerSource, /option\.versions\.length > 1/, 'a dropdown only with more than one version')
assert.match(pickerSource, /version\.id === currentChapterId/, 'okunan surum isaretlenmeli')
// The address must carry a definite distinguisher: for two versions from one team the fansub key is not enough.
assert.match(pageSource, /doesChapterRouteNeedVersionQuery/, 'a version query must be added when needed')
assert.match(pageSource, /versionId: needsVersionQuery \? target\.chapter\.id : null/)

const dataSource = read('src/pages/reader/useReaderV2Chapter.ts')
assert.match(dataSource, /versions: numberVersions/, 'the data layer must provide all versions per number')

// ---------- P) Mobile touches ----------
// The auto reading icon should be meaningful by MODE: a play triangle did not say "auto reading"
// (user request).
assert.match(pageSource, /<FastForward className="size-4" \/>/, 'fast forward icon in page mode')
assert.match(pageSource, /<ChevronsDown className="size-4" \/>/, 'a downward flow icon in strip mode')
assert.doesNotMatch(pageSource, /<Play className=/, 'the general play triangle must not be used')

// Zoom is hidden on mobile: the strip column is already screen width, so
// it changes nothing visible, and the browser already has pinch zoom.
assert.match(panelSource, /hidden space-y-2 md:block/, 'the zoom section must be hidden on mobile')

// ---------- R) The picker closes on an outside click ----------
// A backdrop layer is NOT USED: the header has backdrop-blur and backdrop-filter creates a containing
// block for `position: fixed` children; measured, a `fixed inset-0` layer became 375x48 instead of 375x812 and
// clicking the rest of the screen did not close the picker.
assert.match(pickerSource, /document\.addEventListener\('pointerdown'/, 'disari tiklama belge dinleyicisiyle yakalanmali')
assert.match(pickerSource, /rootRef\.current\?\.contains\(target\)/, 'secicinin kendi icindeki tiklama kapatmamali')
assert.doesNotMatch(pickerSource, /className="fixed inset-0 z-\[9250\]"/, 'arka plan katmani geri gelmemeli (kapsayici blok tuzagi)')

// ---------- S) Back to top ----------
// Floating controls (back to top + continue bar) are in a separate file: both are temporary elements
// sitting over CONTENT, not shell bars. The page only decides when they show.
const floatingSource = read('src/pages/reader/ReaderV2FloatingControls.tsx')
assert.match(floatingSource, /data-testid="reader-v2-scroll-top"/, 'there must be a back to top button')
assert.match(pageSource, /onScrollTop=\{goToStart\}/, 'the existing command must be reused')
assert.match(pageSource, /showScrollTop=\{progress\.percent > 5\}/, 'tepedeyken gosterilmemeli')

// ---------- T) Needless settings hidden on mobile ----------
assert.match(panelSource, /hidden space-y-2 md:block/, 'fit options must hide on mobile')
assert.match(panelSource, /hidden text-\[11px\] leading-5 text-white\/40 md:block/, 'keyboard shortcuts must hide on mobile')

console.log('PASS reader v2 shell contract verified')
