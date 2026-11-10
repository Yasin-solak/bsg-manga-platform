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

const rich = load('src/lib/lettering/rich.ts')
const { layoutText } = load('src/lib/lettering/layout.ts', { './rich': rich })
const hyphenation = load('src/lib/lettering/hyphenation.ts')
hyphenation.registerHyphenator('tr', require('hyphen/tr'))
const trPoints = (word) => hyphenation.hyphenationPoints(word, 'tr')

// --- Parsing and plain text ---------------------------------------------------------------
assert.equal(rich.stripRichMarkup('Bu **gercekten** __cok__ [#e53935]tehlikeli[/]!'), 'Bu gercekten cok tehlikeli!')
assert.equal(rich.hasRichMarkup('duz metin * tek yildiz _ alt cizgi'), false, 'single star / underscore does not count as markup')
assert.equal(rich.stripRichMarkup('[#zzzzzz]x[/]'), '[#zzzzzz]x', 'an invalid color is not markup')

// Parsing after hasRichMarkup does not miss the first mark (global regex lastIndex trap).
assert.equal(rich.hasRichMarkup('Bu **gercekten** yapay'), true)
assert.equal(rich.stripRichMarkup('Bu **gercekten** yapay'), 'Bu gercekten yapay')
assert.deepEqual(rich.encodeRich('Bu **gercekten** yapay').styles, [{}, { bold: true }])
assert.ok(rich.hasRichMarkup('**a**') && rich.hasRichMarkup('**a**'), 'consecutive calls give the same result')

// --- Encoding: each styled word piece opens with its own mark and closes with U+E000 -----------
const { encoded, styles } = rich.encodeRich('Bu **cok onemli** kelime')
assert.deepEqual(styles, [{}, { bold: true }])
const words = encoded.split(/\s+/)
assert.equal(words.length, 4, 'marks create no spacing (same word count)')
assert.deepEqual(rich.segmentsOf(words[1]), [{ text: 'cok', style: 1 }], 'her kelime alt dizesi dogru stille baslar')
assert.deepEqual(rich.segmentsOf(`${words[2]} ${words[3]}`), [{ text: 'onemli', style: 1 }, { text: ' kelime', style: 0 }], 'stil kelime sonunda kapanir')
assert.equal(rich.stripMarks(encoded), 'Bu cok onemli kelime')

const mixed = rich.encodeRich('**[#1e88e5]MAVI[/]** ve [#1e88e5]mavi[/]')
assert.deepEqual(mixed.styles, [{}, { bold: true, color: '#1e88e5' }, { color: '#1e88e5' }], 'styles merge and get reused')

// --- Yerlesim: stilli metin, olcume parca parca girer ---------------------------------------
// Sahte olcum: kalin harf 0.7 em, digerleri 0.55 em (isaretler genislik almaz).
const measureRich = (runStyles) => (text, size) => rich.segmentsOf(text)
  .reduce((sum, segment) => sum + [...segment.text].length * size * (runStyles[segment.style]?.bold ? 0.7 : 0.55), 0)
const box = { width: 160, height: 120, shape: 'kutu', lineHeight: 1.12, size: 16, fixed: true }
const plain = layoutText({ ...box, text: 'Bir kelime burada kalin', measure: measureRich([{}]) })
const bold = rich.encodeRich('Bir kelime burada **kalin**')
const styled = layoutText({ ...box, text: bold.encoded, measure: measureRich(bold.styles) })
assert.equal(rich.stripMarks(styled.lines.map((line) => line.text).join(' ')), 'Bir kelime burada kalin', 'metin kaybolmaz')
assert.ok(styled.lines.at(-1).width > plain.lines.at(-1).width, 'a bold word measures wider')

// Tireyle bolunen stilli kelimenin ikinci parcasi da stilli baslar (carry).
const long = rich.encodeRich('**kaybedeceğim**')
const narrow = layoutText({
  text: long.encoded, width: 70, height: 200, shape: 'kutu', lineHeight: 1.12, size: 16, fixed: true,
  measure: measureRich(long.styles),
  breakPoints: (word) => rich.mapBreakPoints(word, trPoints),
  carry: rich.carryMark,
})
assert.ok(narrow.hyphenated && narrow.lines.length > 1, 'a long styled word splits at syllables')
for (const line of narrow.lines) {
  assert.equal(rich.segmentsOf(line.text)[0].style, 1, `her satir kalin baslar: ${JSON.stringify(rich.stripMarks(line.text))}`)
}
assert.equal(narrow.lines.map((line) => rich.stripMarks(line.text).replace(/-$/, '')).join(''), 'kaybedeceğim', 'split points follow the plain word')

// --- Editor dugmesi: sar / kaldir ------------------------------------------------------------
assert.deepEqual(rich.toggleWrap('bir kelime', 4, 10, '**', '**'), { text: 'bir **kelime**', start: 6, end: 12 })
assert.deepEqual(rich.toggleWrap('bir **kelime**', 6, 12, '**', '**'), { text: 'bir kelime', start: 4, end: 10 }, 'the same mark goes off on the second press')

// --- Source level: the same engine in editor, publish and reader; places needing plain text ---------
const lettering = read('src/lib/translationLettering.ts')
assert.match(lettering, /carry: rich \? carryMark : undefined/)
assert.match(lettering, /layout: rich \? \{ \.\.\.layout, runStyles: rich\.styles \} : layout/)
const paint = read('src/lib/lettering/paint.ts')
assert.match(paint, /if \(glyph\.run\?\.color\) context\.fillStyle = glyph\.run\.color/, 'parca rengi')
assert.match(paint, /context\.lineWidth = boldPx/, 'kalin: yazi rengiyle ince kontur')
assert.match(read('src/pages/translationStudio/editor/reviewChecks.ts'), /fold\(stripRichMarkup\(text\), lang\)/, 'sozluk kontrolu isaretlemeden etkilenmez')
assert.match(read('functions/api/ceviri/reader-translate.js'), /const turkish = stripRichMarkup\(item\.tr_text\)/, 'isaretleme modele gitmez')
assert.match(read('src/pages/translationStudio/editor/RichTextToolbar.tsx'), /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/, 'the button does not break the selection')

console.log('PASS translation studio word-level text style (parsing, encoding, layout, hyphenation, editor)')
