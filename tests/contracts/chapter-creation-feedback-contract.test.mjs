import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../../src/components/fansub/chapterCreate/chapterCreationFeedback.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const module = { exports: {} }
new Function('module', 'exports', 'require', outputText)(module, module.exports, () => ({ intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) }))
const { getChapterCreationFeedback } = module.exports
const now = Date.parse('2026-09-07T12:00:00Z')
const base = { isApproved: true, isActive: true, publishAt: '2026-09-07T11:00:00Z' }
assert.equal(getChapterCreationFeedback(base, now).title, 'Bölüm yayına alındı')
assert.equal(getChapterCreationFeedback({ ...base, publishAt: '2099-01-01T12:00:00Z' }, now).title, 'Bölüm planlandı')
assert.equal(getChapterCreationFeedback({ ...base, isApproved: false }, now).title, 'Bölüm onay bekliyor')
assert.equal(getChapterCreationFeedback({ ...base, isApproved: false, publishAt: '2099-01-01T12:00:00Z' }, now).title, 'Bölüm onay bekliyor')
assert.equal(getChapterCreationFeedback({ ...base, isActive: false }, now).title, 'Bölüm kaydedildi')
assert.equal(getChapterCreationFeedback({ ...base, isApproved: undefined }, now).title, 'Bölüm kaydedildi')
assert.equal(getChapterCreationFeedback({ ...base, isActive: undefined }, now).title, 'Bölüm kaydedildi')
assert.equal(getChapterCreationFeedback({ ...base, publishAt: 'geçersiz' }, now).title, 'Bölüm kaydedildi')
assert.equal(getChapterCreationFeedback({ ...base, publishAt: undefined }, now).title, 'Bölüm kaydedildi')
console.log('PASS chapter creation approval/publish feedback')
