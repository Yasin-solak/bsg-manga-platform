import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { activeLocaleShim } from './i18n-source.mjs'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function load(path, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)((name) => { if (name === '@/i18n/activeLocale') return activeLocaleShim;
    if (name in mocks) return mocks[name]
    throw new Error(`beklenmeyen import: ${name}`)
  }, exports)
  return exports
}

// --- Source level: editor, reader and publish use the same drawing -------------------
const finalRender = read('src/pages/translationStudio/editor/finalRender.ts')
assert.match(finalRender, /paintLettering\(context, style, layout, lang\)/, 'yayin gorseli ortak cizimi kullanir')
assert.doesNotMatch(finalRender, /strokeText/, 'yayin render\'inda ayri kontur kodu kalmadi')
const textBox = read('src/components/translation/TranslatedTextBox.tsx')
assert.match(textBox, /paintLettering\(context, result\.style, result\.layout, lang\)/, 'the editor/reader box uses the same drawing')
assert.doesNotMatch(textBox, /textShadow/, 'DOM text-shadow konturu kaldirildi (yayinla fark yaratiyordu)')
assert.match(textBox, /MAX_CANVAS_PIXELS/, 'buyuk zoom\'da kutu tuvali sinirli')
assert.match(textBox, /aria-label=\{layout\.lines\.map\(\(line\) => line\.text\)\.join\(' '\)\}/, 'tuval metni erisilebilir')
assert.match(read('src/pages/translationStudio/editor/EditorCanvas.tsx'), /resolution=\{letteringResolution\}/, 'the editor draws text at zoom sharpness')
assert.match(read('src/pages/reader/ReaderTranslatedPage.tsx'), /resolution=\{scale \* \(window\.devicePixelRatio \|\| 1\)\}/)

// Panel: the slider sends continuous values, gathered into one undo step.
const panels = read('src/pages/translationStudio/editor/EditorPanels.tsx')
assert.match(panels, /const snapshot = now - lastStyleEdit\.current > 700/)
assert.match(panels, /data-testid='tl-effects'/)
assert.match(read('src/pages/translationStudio/editor/EditorScreen.tsx'), /onStyle=\{\(style, snapshot\) => selected && editor\.updateItem\(selected\.id, \{ style \}, \{ snapshot \}\)\}/)

// DB: new keys and their ranges are validated.
const migration = read('supabase/migrations/20260927162157_translation_studio_v3_lettering_effects.sql')
for (const key of ['color2', 'shadow', 'shadowColor', 'shadowBlur', 'shadowX', 'shadowY', 'bend']) {
  assert.match(migration, new RegExp(`- '${key}'`), `${key} izinli anahtar`)
}
assert.match(migration, /\(p_style->>'bend'\)::numeric not between -100 and 100/)
assert.match(migration, /\(p_style->>'shadowBlur'\)::numeric not between 0 and 100/)

const rich = load('src/lib/lettering/rich.ts')

// --- Style resolution: the old look is kept ---------------------------------------------
const lettering = load('src/lib/translationLettering.ts', {
  '@/lib/customFonts': { customFontFamily: () => '', customFontName: () => '', isCustomFontKey: () => false },
  '@/lib/lettering/hyphenation': { hyphenationPoints: () => [], supportsHyphenation: () => false },
  '@/lib/lettering/layout': { layoutText: () => null },
  '@/lib/lettering/rich': rich,
})
const base = lettering.resolveStyle({ type: 'balon', style: {}, fontSuggestion: null }, 640)
assert.equal(base.strokeWidth, 9, 'the default outline is the old 9%')
assert.equal(base.strokeColor, '#ffffff', 'siyah yaziya beyaz kontur')
assert.equal(lettering.resolveStyle({ type: 'balon', style: { color: '#ffffff' }, fontSuggestion: null }, 640).strokeColor, '#000000')
assert.equal(base.bend, 0)
assert.equal(base.shadow, false)
assert.equal(base.color2, null)

// --- Cizim davranisi (sahte canvas) -----------------------------------------------------
const paint = load('src/lib/lettering/paint.ts', { '@/lib/translationLettering': { fontCss: () => '16px x', BOLD_STROKE_EM: 0.05 }, './rich': rich })

function fakeContext() {
  const calls = []
  const state = { tx: 0, ty: 0, angle: 0, shadowColor: 'transparent' }
  const stack = []
  const ctx = {
    calls,
    font: '', textBaseline: '', textAlign: '', direction: '', lineJoin: '', miterLimit: 0,
    strokeStyle: '', fillStyle: '', lineWidth: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    get shadowColor() { return state.shadowColor },
    set shadowColor(value) { state.shadowColor = value },
    save() { stack.push({ ...state }) },
    restore() { Object.assign(state, stack.pop()) },
    translate(x, y) { state.tx += x; state.ty += y },
    rotate(angle) { state.angle += angle },
    getTransform: () => ({ a: 1, b: 0 }),
    measureText: (text) => ({ width: [...text].length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillText(text, x, y) { calls.push({ op: 'fill', text, x: x + state.tx, y: y + state.ty, angle: state.angle, shadow: state.shadowColor }) },
    strokeText(text, x, y) { calls.push({ op: 'stroke', text, x: x + state.tx, y: y + state.ty, angle: state.angle, shadow: state.shadowColor }) },
  }
  return ctx
}

const style = (patch = {}) => ({ ...base, font: 'diyalog', size: 20, ...patch })
const layout = { size: 20, lineHeightPx: 22, lines: [{ text: 'ABCDEFGHIJ', width: 100, maxWidth: 100 }], overflow: false, hyphenated: false }

{
  const ctx = fakeContext()
  paint.paintLettering(ctx, style(), layout)
  assert.equal(ctx.calls.length, 1, 'plain text makes one call per line')
  assert.equal(ctx.calls[0].x, -50, 'ortali satir')
}
{
  const ctx = fakeContext()
  paint.paintLettering(ctx, style({ stroke: true, strokeColor: '#ff0000', strokeWidth: 20 }), layout)
  assert.deepEqual(ctx.calls.map((call) => call.op), ['stroke', 'fill'], 'kontur dolgudan once')
}
{
  const ctx = fakeContext()
  paint.paintLettering(ctx, style({ stroke: true, shadow: true, shadowColor: '#000000', shadowX: 10, shadowY: 10 }), layout)
  const [strokeCall, fillCall] = ctx.calls
  assert.equal(strokeCall.shadow, '#000000', 'golge dis katmanda')
  assert.equal(fillCall.shadow, 'transparent', 'no second shadow on the fill')
}
{
  const ctx = fakeContext()
  paint.paintLettering(ctx, style({ shadow: true, shadowColor: '#00ffff', shadowX: 0, shadowY: 0 }), layout)
  assert.equal(ctx.calls.length, 2, 'glow darkens with two layers')
}
for (const bend of [60, -60]) {
  const ctx = fakeContext()
  paint.paintLettering(ctx, style({ bend }), layout)
  assert.equal(ctx.calls.length, 10, 'kavisli yazi harf harf')
  const first = ctx.calls[0]
  const last = ctx.calls[9]
  assert.ok(Math.abs(first.angle + last.angle) < 1e-9, 'yay simetrik')
  assert.ok(bend > 0 ? first.angle < 0 : first.angle > 0, 'yay yonu bend isaretine uyar')
  const ys = ctx.calls.map((call) => call.y)
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2
  assert.ok(Math.abs(mid) < 3, `kavisli satir dikeyde ortali (${mid.toFixed(2)})`)
}
{
  // Kisa kelimede yaricap yazi boyunun 2.5 katindan kucuk olmaz.
  const ctx = fakeContext()
  paint.paintLettering(ctx, style({ bend: 100 }), { ...layout, lines: [{ text: 'AB', width: 20, maxWidth: 20 }] })
  assert.ok(Math.abs(ctx.calls[0].angle) < 0.25, 'a short word does not bend too much')
}
assert.ok(paint.paintBleed(style({ bend: 60 }), layout) > paint.paintBleed(style(), layout), 'kavis tuval payini buyutur')

console.log('PASS translation studio v3 text effects (shared drawing, outline, shadow/glow, gradient, arc)')
