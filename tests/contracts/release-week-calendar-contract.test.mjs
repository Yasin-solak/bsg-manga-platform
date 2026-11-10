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
  new Function('require', 'exports', code)((name) => (name === '@/i18n/activeLocale' ? { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) } : name in mocks ? mocks[name] : require(name)), exports)
  return exports
}

const pad = (n) => String(n).padStart(2, '0')
const shared = {
  toDateKey: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  formatChapterNumber: (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1)),
}
const week = load('src/pages/releaseSchedule/releaseWeek.ts', { './releaseSchedulePage.shared': shared })

// Carsamba 30 Eylul 2026 12:00 (yerel).
const now = new Date(2026, 8, 30, 12, 0)
const at = (day, h, m = 0) => new Date(2026, 8, day, h, m).toISOString()
const entry = (id, over) => ({
  chapterId: id, mangaId: 'm1', mangaTitle: 'Ejderha Sarayi', mangaSlug: 'ejderha', chapterNumber: 1,
  fansubId: 'f1', fansubName: 'Ay Isigi', fansubSlug: 'ay-isigi', publishAt: at(30, 19), isUpcoming: true, ...over,
})
const base = { offset: 0, now, filter: 'all', followedFansubIds: new Set(), plannedChapterIds: new Set(), isReminded: () => false }

// --- Week boundaries and headers -----------------------------------------------------------
assert.equal(shared.toDateKey(week.startOfWeek(now)), '2026-09-28', 'hafta Pazartesi baslar')
assert.equal(week.weekTitle(week.startOfWeek(now)), '28 Eyl – 4 Eki 2026', 'a week spanning two months uses short month names')
assert.equal(week.weekTitle(new Date(2026, 8, 14)), '14–20 Eylül 2026')
assert.equal(week.weekNote(0), 'Bu hafta')
assert.equal(week.weekNote(-6), '-6 hafta')
assert.equal(week.weekOffsetOf(new Date(2026, 7, 22), now), -6, 'jump to the week of the target date')

// --- Merge: bulk chapters and multiple translations -------------------------------------------
const rows = [
  entry('c66', { chapterNumber: 66, publishAt: at(30, 20) }),
  entry('c67', { chapterNumber: 67, publishAt: at(30, 20) }),
  entry('c68', { chapterNumber: 68, publishAt: at(30, 20) }),
  entry('d43a', { mangaId: 'm2', mangaTitle: 'Hayalet Locasi', chapterNumber: 43, publishAt: at(30, 20) }),
  entry('d43b', { mangaId: 'm2', mangaTitle: 'Hayalet Locasi', chapterNumber: 43, publishAt: at(30, 20), fansubId: 'f2', fansubName: 'Kuzey Ruzgari' }),
  entry('old', { mangaId: 'm3', mangaTitle: 'Gecen Hafta', publishAt: at(20, 20) }),
]
const built = week.buildReleaseWeek(rows, base)
const wed = built.days[2]
assert.equal(wed.groups.length, 1, 'releases at the same hour make one card')
assert.equal(wed.groups[0].items.length, 2)
const batch = wed.items.find((item) => item.title === 'Ejderha Sarayi')
assert.equal(batch.batch, 3, 'same series + same moment: "3 chapters"')
assert.equal(batch.chapterLabel, 'Böl. 66–68')
assert.equal(batch.entry.chapterNumber, 66, 'the representative is the smallest chapter')
const dual = wed.items.find((item) => item.title === 'Hayalet Locasi')
assert.equal(dual.teams.length, 2, 'the same chapter by two teams: "2 translations"')
assert.equal(built.total, 5, 'total chapter count is counted before merging; out-of-week records do not enter')
assert.equal(wed.groups[0].height, 30 + 58 + 76, 'group height: title + rows (multiple teams are taller)')

// --- Filtreler ---------------------------------------------------------------------------------
assert.equal(week.buildReleaseWeek(rows, { ...base, filter: 'mine', followedFansubIds: new Set(['f2']) }).total, 2, 'followed team')
assert.equal(week.buildReleaseWeek(rows, { ...base, filter: 'plan', plannedChapterIds: new Set(['c66', 'c67']) }).total, 0, 'bulk chapters are planned only if all are planned')
assert.equal(week.buildReleaseWeek(rows, { ...base, filter: 'plan', plannedChapterIds: new Set(['c66', 'c67', 'c68']) }).total, 3)
assert.equal(week.buildReleaseWeek(rows, { ...base, filter: 'rem', isReminded: (row) => row.chapterId === 'd43b' }).days[2].items[0].reminded, true)

// --- Layout: no overlap, axis extends to early hours, now line --------------------------------
const close = week.buildReleaseWeek([
  entry('a', { mangaId: 'a', publishAt: at(30, 20, 0) }),
  entry('b', { mangaId: 'b', publishAt: at(30, 20, 30) }),
], base)
const [first, second] = close.days[2].groups
assert.ok(second.top >= first.top + first.height, 'a card at a nearby hour shifts down')
const early = week.buildReleaseWeek([entry('e', { publishAt: at(29, 2, 44) })], base)
assert.equal(early.startHour, 2, 'with a night release the axis starts early')
assert.equal(early.hours[0].label, '02:00')
assert.equal(built.startHour, 10, 'default axis 10:00-24:00 (prototype)')
assert.equal(built.nowTop, (12 - 10) * week.HOUR_PX, 'the now line relates to the hour axis')
assert.equal(week.buildReleaseWeek(rows, { ...base, now: new Date(2026, 8, 30, 7, 40) }).nowTop, null, 'no line at an hour outside the axis')
assert.equal(week.buildReleaseWeek(rows, { ...base, offset: 1 }).nowTop, null, 'no line in another week')
assert.equal(built.next?.title, 'Ejderha Sarayi', 'next release')

// --- Page and components ---------------------------------------------------------------------
const page = read('src/pages/ReleaseSchedulePage.tsx')
assert.match(page, /listPublicReleaseSchedule\(\{ from: start\.toISOString\(\), daysAhead: 7, limit: 500 \}\)/, 'a week with one query (including past days)')
assert.match(page, /listFollowedFansubIds\(userId, fansubIds\)/, 'teams I follow filter')
assert.match(page, /data-testid='release-week-empty'/, 'empty week state')
assert.match(page, /Sıradaki yayına git/, 'jump from an empty week to the next release')
assert.match(page, /className='hidden lg:block'[\s\S]*<ReleaseWeekGrid[\s\S]*className='lg:hidden'[\s\S]*<ReleaseWeekMobile/, 'desktop grid / mobile day list')
assert.match(read('src/pages/releaseSchedule/ReleaseWeekMobile.tsx'), /role='tablist' aria-label=\{txa\('Haftanın günleri'\)\}/)
assert.match(read('src/pages/releaseSchedule/useReleaseScheduleUserState.ts'), /entryDateKey\(entry\)/, 'hatirlatma yayinin kendi gunune yazilir')
const parts = read('src/pages/releaseSchedule/ReleaseWeekParts.tsx')
assert.match(parts, /aria-pressed=\{item\.reminded\}/)
assert.match(parts, /aria-pressed=\{item\.planned\}/)

console.log('PASS weekly release schedule (week, merge, filters, layout, mobile)')
