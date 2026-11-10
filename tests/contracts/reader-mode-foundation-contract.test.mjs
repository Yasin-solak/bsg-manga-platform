import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const readerPreferencesSource = read('src/services/readerPreferencesService.ts')
const readerHookSource = read('src/hooks/useReaderPreferences.ts')
const readerPageSource = read('src/pages/MangaReaderPage.tsx')
const readerViewportControllerSource = read('src/pages/mangaReader/useReaderViewportController.ts')
const readerAuditDoc = read('docs/reader-mode-audit-2026-04-17.md')

assert.match(readerPreferencesSource, /READER_PREFERENCES_STORAGE_KEY = 'reader-preferences:v1'/)
assert.match(readerPreferencesSource, /export type ReaderLayoutMode = 'vertical' \| 'horizontal-paged'/)
assert.match(readerPreferencesSource, /export type ReaderImageFitMode = 'fit-width' \| 'fit-height' \| 'original'/)
assert.match(readerPreferencesSource, /layoutMode: 'vertical'/)
assert.match(readerPreferencesSource, /zoomLevel: 100/)
assert.match(readerPreferencesSource, /autoScrollSpeed: 90/)
assert.match(readerPreferencesSource, /verticalImageFitMode: 'fit-width'/)
assert.match(readerPreferencesSource, /horizontalImageFitMode: 'fit-height'/)
assert.match(readerPreferencesSource, /export function sanitizeReaderPreferences\(/)
assert.match(readerPreferencesSource, /export function readStoredReaderPreferences\(/)
assert.match(readerPreferencesSource, /export function writeStoredReaderPreferences\(/)

assert.match(readerHookSource, /export function useReaderPreferences\(/)
assert.match(readerHookSource, /useState<ReaderPreferences>\(\(\) => readStoredReaderPreferences\(\)\)/)
assert.match(readerHookSource, /window\.addEventListener\('storage', handleStorage\)/)
assert.match(readerHookSource, /updatePreferences/)

assert.match(readerPageSource, /useReaderPreferences/)
assert.match(readerPageSource, /READER_IMAGE_FIT_MODE_OPTIONS/)
assert.match(readerPageSource, /Dikey ak/)
assert.match(readerPageSource, /Yatay sayfa/)
assert.match(readerPageSource, /updatePreferences\(\{ layoutMode: 'horizontal-paged' \}\)/)
assert.match(readerPageSource, /readerModeSummaryLabel/)
assert.match(readerPageSource, /readerProgressLabel/)
assert.match(readerPageSource, /const horizontalDetailRef = useRef<HTMLDivElement>\(null\)/)
assert.match(readerPageSource, /const readerSupplementaryContent = \(/)
assert.match(readerPageSource, /ref=\{horizontalDetailRef\}/)
assert.match(readerPageSource, /aria-label=\{backwardLabel\}/)
assert.match(readerPageSource, /aria-label=\{forwardLabel\}/)
assert.match(readerPageSource, /cursor-w-resize/)
assert.match(readerPageSource, /cursor-e-resize/)
assert.match(readerPageSource, /useReaderViewportController/)
assert.doesNotMatch(readerPageSource, /const \[zoomLevel, setZoomLevel\]/)
assert.doesNotMatch(readerPageSource, /const \[autoScrollSpeed, setAutoScrollSpeed\]/)

assert.match(readerViewportControllerSource, /READER_ZOOM_LEVELS/)
assert.match(readerViewportControllerSource, /updatePreferences\(\{ zoomLevel:/)
assert.match(readerViewportControllerSource, /updatePreferences\(\{ autoScrollSpeed:/)
assert.match(readerViewportControllerSource, /const imageFitMode = isHorizontalPagedMode \? preferences\.horizontalImageFitMode : preferences\.verticalImageFitMode/)
assert.match(readerViewportControllerSource, /updatePreferences\(\{ horizontalImageFitMode: nextMode \}\)/)
assert.match(readerViewportControllerSource, /updatePreferences\(\{ verticalImageFitMode: nextMode \}\)/)
assert.match(readerViewportControllerSource, /const getActiveScrollContainer = useCallback/)
assert.match(readerViewportControllerSource, /const isNearBottom =/)
assert.match(readerViewportControllerSource, /autoScroll \|\| showSettings \|\| isNearBottom/)

// --- Auto scroll resilience (2026-07-29 revision) ---
// Permanent guard for three real bugs. If removed auto scroll returns to
// "stops as soon as it opens" / "jumps to the end when returning to the tab".

// 1) Lazy pages grew scrollHeight so the bottom moved; the scroll listener should not
//    turn off autoScroll, the stop decision belongs to the rAF loop.
assert.doesNotMatch(
  readerViewportControllerSource,
  /if \(autoScroll && isNearBottom\) setAutoScroll\(false\)/,
  'the scroll listener must not turn off auto scroll: lazy loading moves the bottom',
)
// 2) Decision logic must be in a pure engine: rAF never runs in a hidden tab, so
//    logic embedded in an effect could not be tested. Behavior tests are in
//    reader-auto-scroll-engine-contract.
assert.match(
  readerViewportControllerSource,
  /computeAutoScrollFrame\(/,
  'otomatik kaydirma karari saf motora delege edilmeli (test edilebilirlik)',
)
assert.match(
  read('src/pages/mangaReader/readerAutoScrollEngine.ts'),
  /export function computeAutoScrollFrame/,
)
// 3) Sekme arka plandayken rAF durur; donuste birikmis sure sifirlanmali.
assert.match(readerViewportControllerSource, /visibilitychange/)
// 4) Hiz degisimi rAF dongusunu yeniden kurmamali (ref uzerinden okunur).
assert.match(readerViewportControllerSource, /autoScrollSpeedRef/)

// --- Webtoon (kesintisiz serit) modu ---
assert.match(readerPreferencesSource, /seamlessStrip: boolean/)
assert.match(readerPreferencesSource, /seamlessStrip: false/, 'must be off by default (keeps the manga page boundary)')
assert.match(readerPreferencesSource, /seamlessStrip: typeof value\.seamlessStrip === 'boolean'/)
assert.match(
  read('src/pages/mangaReader/readerDisplayPresentation.ts'),
  /seamlessStrip \? 'gap-0' : 'gap-4'/,
  'webtoon mode must remove the page gap',
)
assert.match(readerPageSource, /getVerticalReaderDeckClassName\(imageFitMode, seamlessStrip\)/)
assert.match(readerPageSource, /toggleSeamlessStrip/)

assert.match(readerAuditDoc, /active modes: `vertical flow`, `horizontal page`/)
assert.match(readerAuditDoc, /ReaderLayoutMode = vertical \| horizontal-paged/)
assert.match(readerAuditDoc, /ReaderImageFitMode = fit-width \| fit-height \| original/)
assert.match(readerAuditDoc, /Horizontal mode works with a page index/)

console.log('PASS reader preference contract and two-mode reader foundation verified')
