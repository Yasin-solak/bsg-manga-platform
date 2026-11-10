/**
 * Auto scroll engine behavior contract.
 *
 * This file is NOT a regex pin but a real behavior test: the engine is a pure function, so it
 * is simulated frame by frame. It is written this way because logic embedded in the rAF loop inside
 * useEffect could not be verified: rAF runs only in a visible tab, never fires in a
 * hidden panel/headless environment, and behavior cannot be measured.
 *
 * Three real bugs covered:
 * 1. Lazy pages move the bottom -> stopping early
 * 2. Accumulated delta on tab return -> jumping to the chapter end
 * 3. The switch staying on forever with no content to scroll
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const enginePath = path.join(rootDir, 'src/pages/mangaReader/readerAutoScrollEngine.ts')
const source = readFileSync(enginePath, 'utf8')

// Convert the TS source to runnable JS: apart from type-only syntax the file is plain JS,
// so dropping type annotations and interface blocks is enough.
function loadEngine() {
  const stripped = source
    .replace(/export interface [\s\S]*?\n}\n/g, '')
    .replace(/: AutoScrollFrameInput/g, '')
    .replace(/: AutoScrollFrameResult/g, '')
    .replace(/export const/g, 'const')
    .replace(/export function/g, 'function')
  const factory = new Function(`${stripped}\nreturn { computeAutoScrollFrame, AUTO_SCROLL_SETTLE_FRAMES, AUTO_SCROLL_MAX_FRAME_MS }`)
  return factory()
}

const { computeAutoScrollFrame, AUTO_SCROLL_SETTLE_FRAMES, AUTO_SCROLL_MAX_FRAME_MS } = loadEngine()

const CLIENT_HEIGHT = 800
const SPEED = 90 // px/s (varsayilan)

/** Frame-by-frame simulation; onScrollHeight can mimic lazy loading. */
function simulate({ frames, scrollHeight, deltaMs = 16, onFrame }) {
  let state = {
    scrollTop: 0,
    scrollHeight,
    settledFrames: 0,
    lastScrollHeight: scrollHeight,
    stopped: false,
    frameCount: 0,
  }

  for (let i = 0; i < frames && !state.stopped; i += 1) {
    if (onFrame) state = { ...state, ...onFrame(state, i) }
    const result = computeAutoScrollFrame({
      scrollTop: state.scrollTop,
      scrollHeight: state.scrollHeight,
      clientHeight: CLIENT_HEIGHT,
      speed: SPEED,
      deltaMs,
      lastScrollHeight: state.lastScrollHeight,
      settledFrames: state.settledFrames,
    })
    state.scrollTop = result.nextScrollTop === null ? state.scrollTop : result.nextScrollTop
    state.settledFrames = result.settledFrames
    state.lastScrollHeight = result.lastScrollHeight
    state.stopped = result.shouldStop
    state.frameCount = i + 1
  }

  return state
}

// --- 1) Normal akis: sabit hizda ilerler, erken durmaz ---
{
  const state = simulate({ frames: 60, scrollHeight: 5000 })
  assert.equal(state.stopped, false, 'auto scroll must not stop on a long chapter')
  // 60 kare x 16ms = 960ms, 90px/s -> ~86px
  assert.ok(state.scrollTop > 70 && state.scrollTop < 100, `beklenen ~86px, olculen ${state.scrollTop}`)
}

// --- 2) Lazy loading: if content keeps growing at the bottom it DOES NOT STOP ---
{
  // Start with short content (bottom at once), a new page loads every 10 frames.
  const state = simulate({
    frames: 120,
    scrollHeight: 900,
    onFrame: (current, index) => (
      index > 0 && index % 10 === 0
        ? { scrollHeight: current.scrollHeight + 900 }
        : {}
    ),
  })
  assert.equal(
    state.stopped,
    false,
    'auto scroll must not stop as lazy pages arrive (old bug: it closed in the first second)',
  )
  assert.ok(state.scrollTop > 0, 'icerik buyudukce kaydirma ilerlemeli')
}

// --- 3) Gercek son: dipte yukseklik sabitlenince durur ---
{
  const state = simulate({ frames: 400, scrollHeight: 1000 })
  assert.equal(state.stopped, true, 'must stop at the bottom after height settles')
  assert.ok(
    state.frameCount > AUTO_SCROLL_SETTLE_FRAMES,
    'must wait a settle time before stopping (an instant stop is the early-stop bug)',
  )
}

// --- 4) Tab return: accumulated delta should not jump to the end in one frame ---
{
  const oneFrame = computeAutoScrollFrame({
    scrollTop: 100,
    scrollHeight: 100000,
    clientHeight: CLIENT_HEIGHT,
    speed: SPEED,
    deltaMs: 45_000, // 45 saniye arka planda kalmis
    lastScrollHeight: 100000,
    settledFrames: 0,
  })
  const advance = oneFrame.nextScrollTop - 100
  const maxExpected = (SPEED * AUTO_SCROLL_MAX_FRAME_MS) / 1000
  assert.ok(
    advance <= maxExpected + 0.001,
    `a single frame jump on tab return must be limited to ${maxExpected}px, measured ${advance}px`,
  )
  assert.ok(advance > 0, 'kirpma ilerlemeyi tamamen durdurmamali')
}

// --- 5) No content to scroll: turn off the switch once height settles ---
{
  const state = simulate({ frames: 200, scrollHeight: CLIENT_HEIGHT - 50 })
  assert.equal(
    state.stopped,
    true,
    'on a short chapter fitting the screen the switch must not stay on forever',
  )
  assert.equal(state.scrollTop, 0, 'kaydirilacak icerik yokken konum degismemeli')
}

// --- 6) Images not loaded yet: do not turn off right away, wait ---
{
  const early = computeAutoScrollFrame({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: CLIENT_HEIGHT,
    speed: SPEED,
    deltaMs: 16,
    lastScrollHeight: 400, // yukseklik degisiyor => icerik yukleniyor
    settledFrames: 0,
  })
  assert.equal(early.shouldStop, false, 'auto scroll must not close while content is still loading')
}

// --- 7) Negatif/bozuk delta guvenligi ---
{
  const result = computeAutoScrollFrame({
    scrollTop: 50,
    scrollHeight: 5000,
    clientHeight: CLIENT_HEIGHT,
    speed: SPEED,
    deltaMs: -1000,
    lastScrollHeight: 5000,
    settledFrames: 0,
  })
  assert.ok(result.nextScrollTop >= 50, 'negatif delta geriye kaydirmamali')
}

// --- 8) Dibi asmaz ---
{
  const result = computeAutoScrollFrame({
    scrollTop: 4190,
    scrollHeight: 5000,
    clientHeight: CLIENT_HEIGHT,
    speed: 100000,
    deltaMs: 16,
    lastScrollHeight: 5000,
    settledFrames: 0,
  })
  assert.equal(result.nextScrollTop, 4200, 'kaydirma dibi asmamali')
}

// --- 9) Progress should not be lost at low speeds (sub-pixel accumulation) ---
// Real bug: position was read back from element.scrollTop each frame;
// the browser rounds to whole pixels, so sub-pixel per-frame progress vanished
// and 60 px/s and below did NOT MOVE at all.
{
  for (const speed of [30, 45, 60]) {
    // Birikimli (dogru) yaklasim: konum kesirli tasinir
    let position = 0
    let settledFrames = 0
    let lastScrollHeight = 20000
    for (let i = 0; i < 60; i += 1) {
      const frame = computeAutoScrollFrame({
        scrollTop: position,
        scrollHeight: 20000,
        clientHeight: CLIENT_HEIGHT,
        speed,
        deltaMs: 16,
        lastScrollHeight,
        settledFrames,
      })
      if (frame.nextScrollTop !== null) position = frame.nextScrollTop
      settledFrames = frame.settledFrames
      lastScrollHeight = frame.lastScrollHeight
    }
    const beklenen = (speed * 60 * 16) / 1000
    assert.ok(
      position > beklenen * 0.9,
      `${speed} px/s hizinda 60 karede ~${beklenen.toFixed(1)}px beklenirdi, olculen ${position.toFixed(1)}px`,
    )

    // A rounding (buggy) approach: as if read back from the DOM each frame
    let rounded = 0
    for (let i = 0; i < 60; i += 1) {
      const frame = computeAutoScrollFrame({
        scrollTop: Math.floor(rounded),
        scrollHeight: 20000,
        clientHeight: CLIENT_HEIGHT,
        speed,
        deltaMs: 16,
        lastScrollHeight: 20000,
        settledFrames: 0,
      })
      rounded = frame.nextScrollTop ?? rounded
    }
    assert.ok(
      position > rounded,
      'accumulated position must progress further than one left to DOM rounding (regression sentinel)',
    )
  }
}

console.log('PASS auto scroll engine behavior contract verified (9 scenarios)')
