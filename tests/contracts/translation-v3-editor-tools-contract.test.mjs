import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const cache = new Map()

/** Converts the TS module to CommonJS and loads it; '@/...' and relative imports resolve the same way. */
function load(path) {
  if (cache.has(path)) return cache.get(path)
  const exports = {}
  cache.set(path, exports)
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const dir = path.split('/').slice(0, -1).join('/')
  const resolve = (name) => {
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
    if (name.startsWith('./')) return load(`${dir}/${name.slice(2)}.ts`)
    throw new Error(`beklenmeyen import ${name}`)
  }
  new Function('require', 'exports', code)(resolve, exports)
  return exports
}

const brush = load('src/lib/mangaTypeset/brush.ts')
const { patchFill } = load('src/lib/mangaTypeset/patchFill.ts')
const { inpaint } = load('src/lib/mangaTypeset/inpaint.ts')

// --- Nokta doldurma: hizli fare hareketi seyrek nokta birakir --------------------------
const dense = brush.densify([{ x: 0, y: 0 }, { x: 50, y: 0 }], 5)
assert.ok(dense.length >= 10 && dense.every((point, index) => index === 0 || point.x - dense[index - 1].x <= 5.0001))
const pressured = brush.densify([{ x: 0, y: 0, p: 0.2 }, { x: 10, y: 0, p: 1 }], 5)
assert.ok(pressured[1].p > 0.2 && pressured[1].p < 1, 'pen pressure is interpolated')

// --- Firca maskesi: sert, yumusak, basinc ---------------------------------------------
const crop = { x: 0, y: 0, w: 60, h: 30 }
const hard = brush.stampMask([{ x: 10, y: 15 }, { x: 50, y: 15 }], 8, 1, crop)
assert.equal(hard[15 * 60 + 30], 1, 'sert firca merkezde tam')
assert.equal(hard[2 * 60 + 30], 0, 'sert firca yaricap disinda bos')
const soft = brush.stampMask([{ x: 10, y: 15 }, { x: 50, y: 15 }], 8, 0, crop)
assert.ok(soft[15 * 60 + 30] > 0.95 && soft[9 * 60 + 30] > 0 && soft[9 * 60 + 30] < 0.6, 'yumusak firca kenara dogru azalir')
assert.ok(Math.abs(soft[9 * 60 + 30] - soft[9 * 60 + 20]) < 0.05, 'ust uste binen damgalar kenari sertlestirmez (en buyuk deger)')
const thin = brush.stampMask([{ x: 10, y: 15, p: 0.2 }, { x: 50, y: 15, p: 1 }], 8, 1, crop)
assert.ok(thin[11 * 60 + 12] === 0 && thin[11 * 60 + 48] === 1, 'basinc dusukken iz ince, yuksekken kalin')

// --- Secim maskeleri ------------------------------------------------------------------
const box = brush.polygonMask(brush.boxPolygon({ x: 2, y: 3 }, { x: 12, y: 8 }), { x: 0, y: 0, w: 20, h: 20 })
assert.equal(box.reduce((sum, value) => sum + value, 0), 50, 'kutu secimi 10x5 piksel')
const W = 40
const H = 20
const img = new Uint8ClampedArray(W * H * 4).fill(255)
for (let y = 0; y < H; y += 1) { const o = (y * W + 20) * 4; img[o] = img[o + 1] = img[o + 2] = 0 }
const wand = brush.floodMask(img, W, H, 5, 5, 16)
assert.equal(wand.mask.reduce((sum, value) => sum + value, 0), 20 * H, 'degnek siyah cizgide durur')
assert.deepEqual(wand.bounds, { x: 0, y: 0, w: 20, h: 20 })

// --- Karistirma ------------------------------------------------------------------------
const target = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255])
brush.blendInto(target, [200, 100, 50], [1, 0.5], 0.5)
assert.deepEqual([...target.slice(0, 3)], [100, 50, 25], 'opaklik %50')
assert.deepEqual([...target.slice(4, 7)], [50, 25, 12], 'maske %50 x opaklik %50')

// --- Content-aware repair: a repeating texture (screentone) continues in phase --------------
const TW = 120
const TH = 120
const tone = new Uint8ClampedArray(TW * TH * 4)
for (let y = 0; y < TH; y += 1) {
  for (let x = 0; x < TW; x += 1) {
    const dot = (x % 6 < 2 && y % 6 < 2) ? 40 : 235
    const o = (y * TW + x) * 4
    tone[o] = tone[o + 1] = tone[o + 2] = dot
    tone[o + 3] = 255
  }
}
const hole = new Uint8Array(TW * TH)
for (let y = 50; y < 74; y += 1) for (let x = 48; x < 76; x += 1) hole[y * TW + x] = 1
const damaged = new Uint8ClampedArray(tone)
for (let i = 0; i < hole.length; i += 1) if (hole[i]) { damaged[i * 4] = damaged[i * 4 + 1] = damaged[i * 4 + 2] = 0 }
const error = (result) => {
  let sum = 0
  let count = 0
  for (let i = 0; i < hole.length; i += 1) if (hole[i]) { sum += Math.abs(result[i * 4] - tone[i * 4]); count += 1 }
  return sum / count
}
const patched = error(patchFill({ pixels: damaged, width: TW, height: TH, mask: hole }))
const blurred = error(inpaint({ pixels: damaged, width: TW, height: TH, mask: hole }))
assert.ok(patched < 5, `screentone continues exactly (average error ${patched.toFixed(1)})`)
assert.ok(blurred > patched * 5, `Telea is blurry (error ${blurred.toFixed(1)}), the new repair is far better`)

// --- Kaynak duzeyi sozlesmeler ---------------------------------------------------------
const cleanSource = read('src/pages/translationStudio/editor/cleanRender.ts')
assert.match(cleanSource, /const points = densify\(stroke\.points, Math\.max\(1\.5, stroke\.radius \* 0\.5\)\)/, 'silgi seyrek izde de keser')
assert.match(cleanSource, /if \(stroke\.tool === 'secim'\) \{ result\.push\(stroke\); continue \}/, 'silgi secim islemine dokunmaz')
assert.match(cleanSource, /export async function renderItemsClean\(/, 'otomatik temizlik ayri onbelleklenebilir')
assert.match(cleanSource, /patchFill\(\{ pixels: image\.data/, 'onarim icerige duyarli')
const canvasSource = read('src/pages/translationStudio/editor/EditorCanvas.tsx')
assert.match(canvasSource, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/, 'Ctrl+wheel zoom prevents browser zoom')
assert.match(canvasSource, /event\.code === 'Space'/, 'temporary pan with Space')
assert.match(canvasSource, /onStrokes\(next, !drag\.changed\)/, 'bos silgi hareketi gecmise adim eklemez')
assert.match(canvasSource, /activeTool === 'firca' && event\.altKey\) \{ onPickColor\(point\)/, 'Alt+tik damlalik')
const screenSource = read('src/pages/translationStudio/editor/EditorScreen.tsx')
assert.match(screenSource, /current\.applied\.every\(\(stroke, index\) => stroke === next\[index\]\)/, 'only the new stroke is applied (incremental)')
assert.match(screenSource, /if \(source\.style\.size === undefined\) delete resolved\.size/, 'stil aktarma otomatik sigdirmayi kapatmaz')
assert.match(screenSource, /applySelection\('onar'\)/)
const service = read('src/services/translationEditorService.ts')
assert.match(service, /typeof stroke\.opacity === 'number' && stroke\.opacity < 1 \? \{ opacity:/, 'opaklik kaydedilir')
const migration = read('supabase/migrations/20260927153458_translation_studio_v3_editor_strokes_v2.sql')
assert.match(migration, /v_tool not in \('firca', 'onarim', 'silgi', 'damga', 'geri', 'secim'\)/)
assert.match(migration, /\(v_stroke->>'mode' = 'doldur'\) <> \(v_stroke \? 'color'\)/, 'color is required in color fill')

console.log('PASS translation studio v3 editor tools (brush, selection, wand, content-aware repair, eraser, navigation)')
