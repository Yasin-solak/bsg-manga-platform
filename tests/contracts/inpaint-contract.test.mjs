/**
 * Inpainting contract for text over art.
 *
 * **Why a separate file.** deep-audit matches a `src/lib/*` module's test by a FILE NAME token;
 * with pins inside another test file the module would count as
 * "critical and untested".
 *
 * **This test's stance: MEASURE, do not guess.** "Looks good" is not a measure.
 * Each claim is verified with NUMBERS on a synthetic background: how far a repaired pixel
 * deviates from the real background and how much better that is than the old behavior
 * (painting white).
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

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const inpainter = loadModule('src/lib/mangaTypeset/inpaint.ts')

const W = 96
const H = 96

/** RGBA canvas; `shade(x, y)` gives a gray tone. */
function makeImage(shade) {
  const pixels = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const offset = (y * W + x) * 4
      const value = shade(x, y)
      pixels[offset] = value
      pixels[offset + 1] = value
      pixels[offset + 2] = value
      pixels[offset + 3] = 255
    }
  }
  return pixels
}

/** A thin mask like text: two horizontal strips. */
function makeStrokeMask() {
  const mask = new Uint8Array(W * H)
  for (const top of [30, 54]) {
    for (let y = top; y < top + 6; y += 1) {
      for (let x = 18; x < 78; x += 1) mask[y * W + x] = 1
    }
  }
  return mask
}

/** Maskelenen piksellerde gercek zeminden ORTALAMA sapma. */
function meanError(result, truth, mask) {
  let total = 0
  let count = 0
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0) continue
    total += Math.abs(result[index * 4] - truth[index * 4])
    count += 1
  }
  return count === 0 ? 0 : total / count
}

// ---------- A) The module must stay PURE ----------
// Decision logic should be testable independently of the browser; same rule as `bubbleDetector`.
const source = read('src/lib/mangaTypeset/inpaint.ts')
assert.doesNotMatch(
  stripComments(source),
  /\bdocument\b|\bwindow\b|getImageData|createElement|createImageBitmap/,
  'the repair module must not use browser APIs',
)

// ---------- B) Gradient background: must be CLEARLY better than the old behavior ----------
// This is the main case the project wants to solve: text on a gradient/screentone background,
// not a flat white balloon.
const gradient = makeImage((x, y) => 40 + Math.round((x + y) * 0.9))
const strokeMask = makeStrokeMask()

const repaired = inpainter.inpaint({ pixels: gradient, width: W, height: H, mask: strokeMask })

// Bugunku davranis: maskeyi beyaza boya.
const whiteFilled = new Uint8ClampedArray(gradient)
for (let index = 0; index < strokeMask.length; index += 1) {
  if (strokeMask[index] === 0) continue
  whiteFilled[index * 4] = 255
  whiteFilled[index * 4 + 1] = 255
  whiteFilled[index * 4 + 2] = 255
}

const repairedError = meanError(repaired, gradient, strokeMask)
const whiteError = meanError(whiteFilled, gradient, strokeMask)

assert.ok(
  repairedError < 6,
  `gradyan zemin geri kurulmali (ortalama sapma ${repairedError.toFixed(2)})`,
)
assert.ok(
  repairedError * 8 < whiteError,
  `repair must be clearly better than painting white (${repairedError.toFixed(2)} vs ${whiteError.toFixed(2)})`,
)

// ---------- C) The input MUST NOT CHANGE ----------
// The studio reuses the same image for preview and export;
// changing in place would run the second call with corrupted data.
assert.notEqual(repaired, gradient, 'repair must return a new array')
assert.equal(gradient[(33 * W + 40) * 4], 40 + Math.round((40 + 33) * 0.9), 'girdi yerinde degismemeli')

// ---------- D) Empty mask: the image must stay as is ----------
// If the user says "clean" without selecting anything the page should not change.
const untouched = inpainter.inpaint({
  pixels: gradient,
  width: W,
  height: H,
  mask: new Uint8Array(W * H),
})
assert.deepEqual(Array.from(untouched), Array.from(gradient), 'an empty mask must not change the image')

// ---------- E) Structure carries PARTLY; the limit was MEASURED ----------
// Without the direction factor the result turns into blur spreading evenly in all directions and
// the line vanishes at the mask. This pin protects that factor.
//
// **Honest limit (measured).** On a line crossing a 6-pixel-thick mask the repaired value is ~163;
// the real value is 20, the background 230. So the line
// DOES NOT VANISH but is not fully rebuilt either. This is a known weakness of diffusion-based
// inpainting: structured regions such as SFX over art blur.
// Product decisions should follow: ready for screentone/gradient backgrounds, line
// art needs manual retouching.
const lineImage = makeImage((x, y) => (Math.abs(x - y) <= 2 ? 20 : 230))
const lineMask = new Uint8Array(W * H)
for (let y = 41; y < 47; y += 1) {
  for (let x = 20; x < 76; x += 1) lineMask[y * W + x] = 1
}

const lineRepaired = inpainter.inpaint({ pixels: lineImage, width: W, height: H, mask: lineMask })

const onLine = lineRepaired[(44 * W + 44) * 4]
const offLine = lineRepaired[(44 * W + 70) * 4]
assert.ok(offLine > 180, `off-line ground must stay light (measured ${offLine})`)
// Alt sinir pinleniyor, ust sinir DEGIL: algoritma iyilesirse gate kirilmasin.
assert.ok(
  offLine - onLine > 40,
  `cizgi kismen de olsa tasinmali (fark ${(offLine - onLine).toFixed(0)})`,
)

// ---------- G) The direction factor protects the EDGE ----------
// The crossing line case in E did not distinguish the direction factor (measured: the same result
// with or without). Where the factor really helps is here:
// an EDGE crossing the mask perpendicularly. The direction factor forces samples from the same side of the edge;
// without it the two sides mix.
//
// Measured edge contrast: with factor 134, without 115 (real 180).
const edgeImage = makeImage((x, y) => (y < 48 ? 40 : 220))
const edgeMask = new Uint8Array(W * H)
for (let y = 20; y < 76; y += 1) {
  for (let x = 42; x < 54; x += 1) edgeMask[y * W + x] = 1
}

const edgeRepaired = inpainter.inpaint({ pixels: edgeImage, width: W, height: H, mask: edgeMask })
const aboveEdge = edgeRepaired[(44 * W + 48) * 4]
const belowEdge = edgeRepaired[(52 * W + 48) * 4]

assert.ok(
  belowEdge - aboveEdge > 125,
  `kenar karsitligi korunmali (olculen ${(belowEdge - aboveEdge).toFixed(0)}; yon carpani olmadan ~115)`,
)

// ---------- F) Text mask: ink is found and INFLATED ----------
// If semi-transparent pixels at letter edges are left, a ghost outline remains after the repair;
// only inflation (dilate) prevents this.
const textImage = makeImage((x, y) => (y >= 44 && y < 50 && x >= 30 && x < 60 ? 20 : 240))
const region = { x: 0, y: 0, width: W, height: H }

const tightMask = inpainter.buildTextMask({
  pixels: textImage, width: W, height: H, region, dilate: 0,
})
const grownMask = inpainter.buildTextMask({
  pixels: textImage, width: W, height: H, region, dilate: 2,
})

const countMask = (mask) => mask.reduce((sum, value) => sum + (value ? 1 : 0), 0)
assert.equal(countMask(tightMask), 30 * 6, 'ink must be found exactly')
assert.ok(countMask(grownMask) > countMask(tightMask), 'maske sisirilmeli')
assert.equal(grownMask[43 * W + 45], 1, 'sisirme harfin ustunu de kapsamali')

// Ink should not be searched OUTSIDE the region: the rest of the page is art anyway.
const narrow = inpainter.buildTextMask({
  pixels: textImage,
  width: W,
  height: H,
  region: { x: 0, y: 0, width: 20, height: H },
  dilate: 0,
})
assert.equal(countMask(narrow), 0, 'bolge disindaki murekkep maskelenmemeli')

console.log(
  `PASS repair contract verified (gradient drift ${repairedError.toFixed(2)},`
  + ` white paint ${whiteError.toFixed(2)})`,
)
