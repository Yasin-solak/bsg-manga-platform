import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function load(path, mocks) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)((name) => {
    if (name === '@/i18n/activeLocale') return { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) }
    if (name in mocks) return mocks[name]
    throw new Error(`beklenmeyen import: ${name}`)
  }, exports)
  return exports
}

// --- Kalite kontrolu: tasma + sozluk -----------------------------------------------------
let overflow = false
const richExports = {}
new Function('require', 'exports', ts.transpileModule(read('src/lib/lettering/rich.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(() => ({}), richExports)
const { reviewIssues } = load('src/pages/translationStudio/editor/reviewChecks.ts', {
  '@/lib/translationLettering': { layoutLettering: () => ({ layout: { overflow } }) },
  '@/lib/lettering/rich': richExports,
})
const item = { text: 'Merhaba Saito-san', sourceText: '斉藤さん、こんにちは' }
const glossary = [{ source: '斉藤', target: 'Saito', note: null }, { source: '病院', target: 'hastane', note: null }]
assert.deepEqual(reviewIssues(item, 800, glossary), [], 'a translation matching the glossary and fitting is fine')
assert.deepEqual(reviewIssues({ ...item, text: 'Merhaba Sato' }, 800, glossary).map((issue) => issue.kind), ['sozluk'], 'a glossary warning if the term is missing')
assert.deepEqual(reviewIssues({ ...item, text: 'merhaba SAITO' }, 800, glossary), [], 'case-insensitive (Turkish I -> dotless i trap)')
assert.deepEqual(reviewIssues({ ...item, sourceText: '病院', text: 'HASTANE' }, 800, glossary), [], 'bagiran balonda Turkce terim de eslesir')
overflow = true
assert.deepEqual(reviewIssues(item, 800, glossary).map((issue) => issue.kind), ['tasma'], 'a translation that does not fit')
assert.deepEqual(reviewIssues({ ...item, text: '  ' }, 800, glossary), [], 'an empty translation is not checked (there is a Missing filter)')
overflow = false

// --- Data: the chapter in one query, suggestions piece by piece ------------------------------------------
const service = read('src/services/translationEditorService.ts')
assert.match(service, /export async function loadProjectItems\(pageIds: string\[\], language: string, signal\?: AbortSignal\)/)
assert.match(service, /\.select\(ITEM_COLUMNS\)\.in\('page_id', pageIds\)/)
const review = read('src/pages/translationStudio/editor/ReviewScreen.tsx')
assert.match(review, /ensureFonts\(loaded\.filter/, 'overflow is measured once the real font loads')
assert.match(review, /if \(!fontsReady\) return map/, 'no issue list before fonts load')
assert.match(review, /index \+= 150/, 'oneriler 150lik parcalarla (URL siniri)')

// --- Save and bulk approval ---------------------------------------------------------------
assert.match(review, /saveHumanText\(item, LANGUAGE, text, status\)/, 'surum kontrollu insan metni')
assert.match(review, /if \(error instanceof TlConflictError\)/, 'on a conflict the current state loads')
assert.match(review, /item\.status === 'oneri' && \(drafts\[item\.id\] \?\? item\.text\)\.trim\(\)/, 'bulk approve only for non-empty suggestions')
assert.match(review, /await Promise\.all\(\[worker\(\), worker\(\), worker\(\), worker\(\)\]\)/, 'toplu onay 4 paralel')
assert.match(review, /data-testid='tl-review-undo'/, 'toplu onay geri alinabilir')
assert.match(review, /if \(key === 'enter' && target\?\.tagName === 'BUTTON'\) return/, 'Enter on a focused button does not double the job')
assert.match(review, /URL\.revokeObjectURL\(url\)/, 'page images are released')

// --- Rota -----------------------------------------------------------------------------------
const page = read('src/pages/translationStudio/TranslationStudioPage.tsx')
assert.match(page, /incele: 'incele'/)
assert.match(page, /const stageScreen: Screen = screen === 'incele' \|\| screen === 'gorevler' \? 'duzenle' : screen/, 'review (and tasks) count in the Edit step')
assert.match(page, /data-testid=\{`tl-view-\$\{key\}`\}/)

console.log('PASS translation studio v3 bulk review (quality check, bulk approve, route)')
