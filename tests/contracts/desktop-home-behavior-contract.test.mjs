import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const output = ts.transpileModule(read('src/components/home/desktop/chapterFilters.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('module', 'exports', output)(module, module.exports)
const { filterDesktopChapters } = module.exports
const now = new Date(2026, 8, 14, 12) // Monday; week and day boundaries coincide.
const rows = [
  { chapterId: 'today', publishAt: new Date(2026, 8, 14, 0).toISOString() },
  { chapterId: 'yesterday', publishAt: new Date(2026, 8, 13, 23, 59).toISOString() },
  { chapterId: 'old', publishAt: new Date(2026, 8, 1).toISOString() },
  { chapterId: 'future', publishAt: new Date(2026, 8, 14, 13).toISOString() },
  { chapterId: 'bad', publishAt: 'invalid' },
]
const ids = tab => filterDesktopChapters(rows, tab, now).map(row => row.chapterId)
assert.deepEqual(ids('today'), ['today'])
assert.deepEqual(ids('yesterday'), ['yesterday'])
assert.deepEqual(ids('week'), ['today'])
assert.deepEqual(ids('all'), ['today', 'yesterday', 'old'])
const page = read('src/pages/HomePage.tsx')
assert.ok(page.indexOf('<HomeNewChapters') < page.indexOf('<HomeTrendingGrid'))
assert.ok(page.indexOf('<HomeTrendingGrid') < page.indexOf('<HomeRecommendedRail'))
assert.match(page, /chapterPath: buildPublicChapterPath/)
assert.match(page, /<HomeMobile/)
assert.match(read('src/components/home/desktop/desktop-home.css'), /@media \(min-width:1024px\)/)
assert.match(read('src/components/home/desktop/useDesktopFollow.ts'), /locks.current.has/)
assert.doesNotMatch(read('src/components/home/HomeRecommendedRail.tsx'), /% uyum|96%/)
console.log('PASS desktop publish date limits, chapter target and mobile scope split')

const premiumModule = { exports: {} }
new Function('module', 'exports', ts.transpileModule(read('src/components/home/desktop/premiumCardState.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(premiumModule, premiumModule.exports)
const { getPremiumCardState } = premiumModule.exports
const base = Date.parse('2026-09-14T12:00:00Z')
const day = 86400000
for (const value of [undefined, null, '', 'invalid', new Date(base).toISOString(), new Date(base - day).toISOString()]) assert.equal(getPremiumCardState(value, base).kind, 'offer')
assert.deepEqual(getPremiumCardState(new Date(base + 7 * day).toISOString(), base), { kind: 'expiring', days: 7 })
assert.equal(getPremiumCardState(new Date(base + 7 * day + 1).toISOString(), base).kind, 'hidden')
assert.deepEqual(getPremiumCardState(new Date(base + 1).toISOString(), base), { kind: 'expiring', days: 1 })
const sidebar = read('src/components/layout/AppSidebar.tsx')
assert.match(sidebar, /enableSearchHotkey \? <DesktopHomeNav/)
assert.match(read('src/main.tsx'), /import '.\/components\/home\/desktop\/desktop-home.css'/)
assert.match(read('src/components/home/HomeFansubSection.tsx'), /<FansubHoverCard/)
console.log('PASS Premium expiry limits and shared desktop sidebar')
