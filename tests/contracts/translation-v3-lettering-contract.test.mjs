import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function load(path, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)((name) => (name in mocks ? mocks[name] : require(name)), exports)
  return exports
}

const { layoutText, lineWidths } = load('src/lib/lettering/layout.ts')
const hyphenation = load('src/lib/lettering/hyphenation.ts')
hyphenation.registerHyphenator('tr', require('hyphen/tr'))
hyphenation.registerHyphenator('en', require('hyphen/en-us'))
const trPoints = (word) => hyphenation.hyphenationPoints(word, 'tr')

// Esit genislikli sahte olcum: karakter basina 0.55 em.
const measure = (text, size) => [...text].length * size * 0.55
const base = { shape: 'elips', lineHeight: 1.12, measure, breakPoints: trPoints }
const wordsOf = (text) => text.split(/\s+/).filter(Boolean)

// --- Heceleme: TDK hece sinirlari, kisa kelime asla bolunmez -------------------
const split = (word) => {
  const points = trPoints(word)
  return points.length ? [...word].reduce((out, char, index) => out + (points.includes(index) ? '·' : '') + char, '') : word
}
assert.equal(split('geliştirmeler'), 'geliş·tir·me·ler', 'TDK heceleri (ge-lis-tir-me-ler), bas/sonda 3 harften az kalmaz')
assert.equal(split('kaybedeceğim'), 'kay·be·de·ce·ğim')
assert.deepEqual(trPoints('yapay'), [], '"yapay" (5 letters) is never split: no "ya-/pay"')
assert.deepEqual(trPoints('bugünde'), [], 'a word under 7 letters is not split')
for (const word of ['geliştirmeler', 'kaybedeceğim', 'asistanlarının', 'Üniversitesi', 'kontrolsüzlük']) {
  for (const point of trPoints(word)) {
    assert.ok(point >= 3 && [...word].length - point >= 3, `${word}: at least 3 letters on each side of the split`)
  }
}
assert.ok(trPoints('asistanlarının').includes(4), 'asis-tanlarinin (TDK: a-sis-tan, the first letter does not stay alone)')
assert.ok(!trPoints('Hastanesi’nde').some((point) => point >= 9), 'kesme isaretinin yani bolunmez')
assert.deepEqual(trPoints('10.000TL'), [], 'rakamli kelime bolunmez')
assert.deepEqual(hyphenation.hyphenationPoints('internationalization', 'ar'), [], 'no split in a language with no loaded pattern')

// --- User example: words stay whole, fit in the balloon -------------------------
const sentence = 'bügünde yapay zeka ile geliştirmeler yapıyorum'
const fitted = layoutText({ ...base, text: sentence, width: 200, height: 170, size: 22 })
assert.equal(fitted.overflow, false)
assert.equal(fitted.hyphenated, false, 'with room the word is not split, the text shrinks')
assert.deepEqual(wordsOf(fitted.lines.map((line) => line.text).join(' ')), wordsOf(sentence), 'no word was split')
for (const line of fitted.lines) assert.ok(line.width <= line.maxWidth + 0.01, 'her satir kendi elips kirisine sigar')

// Long text shrinks to fit; no overflow.
const long = 'Devlet hastanelerinde biraz daha iyiymiş ama özel hastane asistanlarının yaklaşık yüzde yetmişinin maaşı on bin yenin altında.'
const shrunk = layoutText({ ...base, shape: 'kutu', text: long, width: 240, height: 280, size: 26 })
assert.equal(shrunk.overflow, false)
assert.ok(shrunk.size < 26 && shrunk.size >= 13, 'shrinks until it fits the balloon, not below the smallest size')
assert.ok(shrunk.lines.length * shrunk.lineHeightPx <= 280, 'dikeyde de sigar')

// Kelime en kucuk boyutta bile satira sigmiyorsa: hece sinirinda, tireyle.
const narrow = layoutText({ ...base, shape: 'kutu', text: 'geliştirmeler', width: 80, height: 200, size: 20, minSize: 18 })
assert.equal(narrow.hyphenated, true)
const pieces = narrow.lines.map((line) => line.text)
assert.ok(pieces.slice(0, -1).every((piece) => piece.endsWith('-')), 'bolunen satir tireyle biter')
assert.equal(pieces.map((piece) => piece.replace(/-$/, '')).join(''), 'geliştirmeler')
let offset = 0
for (const piece of pieces.slice(0, -1)) {
  offset += [...piece.replace(/-$/, '')].length
  assert.ok(trPoints('geliştirmeler').includes(offset), `bolme ${offset}. harfte gecerli hece siniri`)
}

// Kisa kelime bolunmez; sigmazsa tasma bildirilir (editor uyarir), "ya-/pay" yapilmaz.
const tiny = layoutText({ ...base, shape: 'kutu', text: 'yapay', width: 30, height: 200, size: 20, minSize: 18 })
assert.equal(tiny.overflow, true)
assert.deepEqual(tiny.lines.map((line) => line.text), ['yapay'])

// No shrinking if the user picked the size by hand.
assert.equal(layoutText({ ...base, text: sentence, width: 120, height: 400, size: 30, fixed: true }).size, 30)

// Elips: orta satir ust satirdan genis; blok yuksekligi asilinca null.
const frame = { ellipse: true, halfW: 90, halfH: 70, rectW: 0, rectH: 0 }
const widths = lineWidths(frame, 3, 30)
assert.ok(widths[1] > widths[0] && widths[1] > widths[2])
assert.equal(lineWidths(frame, 6, 30), null)

// Balanced lines: no orphan one-word last line.
const balanced = layoutText({ ...base, shape: 'kutu', text: 'Ben böyle gidersem insanlığımı kaybedeceğim', width: 300, height: 200, size: 20 })
const counts = balanced.lines.map((line) => wordsOf(line.text).length)
assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, 'satirlar kelime sayisinca dengeli')

// --- Balon bolgesi: sutun disindaki yazi da silinir, cizgi korunur -------------------
const { findBalloonRegion, snapBoxToBalloon } = load('src/lib/mangaTypeset/balloonRegion.ts')
const W = 240
const H = 240
const img = new Uint8ClampedArray(W * H * 4).fill(255)
const paint = (x, y, value) => { const o = (y * W + x) * 4; img[o] = img[o + 1] = img[o + 2] = value }
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) paint(x, y, 120) // gri cizim zemini
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const d = ((x - 120) / 80) ** 2 + ((y - 120) / 90) ** 2
    if (d <= 1) paint(x, y, 255)
    if (d > 0.9 && d <= 1.08) paint(x, y, 0) // balon cizgisi
  }
}
const column = (x0) => { for (let y = 80; y < 160; y += 1) for (let x = x0; x < x0 + 8; x += 1) if (y % 12 < 8) paint(x, y, 10) }
column(126) // tespit kutusundaki sutun
column(96) // kutu disinda kalan komsu sutun
const box = { x: 120, y: 76, w: 20, h: 88 }
const region = findBalloonRegion(img, W, H, box)
assert.ok(region && !region.leaked && !region.open, 'a closed balloon is found')
assert.equal(region.interior[100 * W + 98], 1, 'kutu disindaki sutun da boyanir')
assert.equal(region.interior[100 * W + 128], 1, 'kutudaki yazi boyanir')
assert.equal(region.interior[120 * W + 41], 0, 'balon cizgisi boyanmaz')
assert.equal(region.interior[5 * W + 5], 0, 'balon disi boyanmaz')
const snapped = snapBoxToBalloon(region, { x: 0, y: 0, w: W, h: H }, box)
assert.ok(snapped && snapped.w > box.w * 4, 'kutu balonun icine genisler')
const shared = snapBoxToBalloon(region, { x: 0, y: 0, w: W, h: H }, box, [{ x: 150, y: 90, w: 30, h: 60 }])
assert.ok(shared && shared.x + shared.w <= 146 && shared.x < box.x, 'bitisik balonda komsu kutuya dogru orta cizgide kesilir')
const blank = new Uint8ClampedArray(W * H * 4).fill(255)
for (let y = 80; y < 160; y += 1) for (let x = 126; x < 134; x += 1) { const o = (y * W + x) * 4; blank[o] = blank[o + 1] = blank[o + 2] = 0 }
assert.equal(findBalloonRegion(blank, W, H, box), null, 'with no closed balloon (leaks into the page) it returns to the threshold method')

// --- Source level: all outputs use the same engine -----------------------------
const finalRender = read('src/pages/translationStudio/editor/finalRender.ts')
assert.match(finalRender, /layoutLettering\(item, text, pageWidth, lang\)/)
assert.match(finalRender, /await ensureHyphenation\(lang\)/)
assert.doesNotMatch(finalRender, /harf sinirindan kir/, 'harf sinirindan tiresiz kirma kaldirildi')
const textBox = read('src/components/translation/TranslatedTextBox.tsx')
assert.match(textBox, /layout\.lines\.map\(/)
assert.doesNotMatch(textBox, /overflow-wrap:anywhere/, 'tarayici kelimeyi rastgele harften bolmez')
assert.match(read('src/pages/reader/ReaderTranslatedPage.tsx'), /lang=\{item\.text \? language : 'tr'\}/)
const cleanSource = read('src/pages/translationStudio/editor/cleanRender.ts')
assert.match(cleanSource, /if \(cleanBalloon\(context, item, width, height\)\) return/)
assert.doesNotMatch(cleanSource, /rx = item\.w \/ 2 \* 0\.94/, 'kutuyu elipsle kirpip kose harflerini birakan kod kaldirildi')
assert.match(read('src/pages/translationStudio/StepScan.tsx'), /await snapPageItemsToBalloons\(page\.id, controller\.signal\)\.catch\(\(\) => 0\)/)
assert.match(read('functions/api/ceviri/scan.js'), /cleanup: item\.type === 'sfx' \|\| item\.type === 'tabela' \? 'onarim' : 'beyaz'/)

console.log('PASS translation studio v3 text layout (hyphenation, fit, balloon cleanup, box seating)')
