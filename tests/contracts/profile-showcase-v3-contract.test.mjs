import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { untranslate } from './i18n-source.mjs'

const require = createRequire(import.meta.url)
const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))

function load(path, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)((name) => (name === '@/i18n/activeLocale' ? { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) } : name in mocks ? mocks[name] : require(name)), exports)
  return exports
}

// --- Layout rules (same as the server rule) --------------------------------------------------
const layout = load('src/pages/profile/profileLayout.ts')
assert.deepEqual(layout.DEFAULT_PROFILE_LAYOUT, { slotLeft: 'badges', slotRight: 'reading', tabs: ['overview', 'stats', 'lists', 'about'] })
assert.deepEqual(layout.normalizeProfileLayout({ slotLeft: 'fav', slotRight: 'fav', tabs: ['lists', 'hack', 'lists'] }),
  { slotLeft: 'fav', slotRight: 'none', tabs: ['overview', 'lists'] }, 'the same module is not in two slots, Overview is first, invalid/repeated are dropped')
assert.deepEqual(layout.assignSlot({ slotLeft: 'badges', slotRight: 'reading', tabs: ['overview'] }, 'left', 'reading'),
  { slotLeft: 'reading', slotRight: 'badges', tabs: ['overview'] }, 'selecting a module in another slot swaps places')
assert.deepEqual(layout.moveTab(['overview', 'stats', 'lists'], 2, 0), ['overview', 'lists', 'stats'], 'Overview stays locked')
assert.deepEqual(layout.PROFILE_SLOT_MODULES.map((module) => module.id), ['badges', 'reading', 'fav', 'list', 'stats', 'genres', 'level', 'teams', 'activity', 'none'])
assert.equal(Object.keys(layout.PROFILE_LAYOUT_TABS).length, 7)

const migration = read('supabase/migrations/20260930051700_user_profile_layouts.sql')
assert.match(migration, /slot_left in \('badges', 'reading', 'fav', 'list', 'post', 'stats', 'none'\)/)
assert.match(migration, /tabs\[1\] = 'overview'/)
assert.match(migration, /v_user uuid := app_private\.current_public_user_id\(\)/, 'only the owner writes')
assert.match(migration, /for select to anon, authenticated using \(true\)/, 'a visitor sees the same layout')

// --- Sayfa ------------------------------------------------------------------------------------
const page = read('src/pages/ProfilePage.tsx')
assert.match(page, /<ProfileShowcaseStage[\s\S]+card=\{\(\s*<ProfileIdentityShowcase/, 'the identity card is at the center of the showcase')
assert.match(page, /<ProfileStickyTabs[\s\S]+canEdit=\{controller\.isOwnProfile\}/, 'only the owner edits tabs')
assert.match(page, /useProfileLayout\(controller\.user\?\.id, controller\.isOwnProfile\)/)
for (const tab of ['overview', 'stats', 'lists', 'about', 'badges', 'favs', 'teams']) {
  assert.ok(page.includes(`tab === '${tab}'`), `the ${tab} tab has content`)
}
const slot = read('src/pages/profile/ProfileShowcaseSlot.tsx')
assert.match(slot, /if \(!has && !canEdit\) return null/, 'an empty slot is invisible to visitors')
assert.match(slot, /Math\.round\(\(item\.chapterNumber \/ total\) \* 100\)/, 'reading progress is real (chapter / last chapter)')
assert.match(read('src/pages/profile/profilePageLoader.ts'), /lastChapterNumber: Number\(historyItem\?\.manga\?\.last_chapter_number\)/)
// Clipping only on the background (menus can overflow): the background clips in the profile theme layer, the scene does not.
assert.match(read('src/pages/profile/ProfileThemeBackdrop.tsx'), /'pointer-events-none absolute inset-0 overflow-hidden/, 'clipping only on the background (menus can overflow)')
assert.doesNotMatch(read('src/pages/profile/ProfileShowcaseStage.tsx').match(/<section ref=\{sectionRef\} className='[^']*'/)?.[0] ?? 'overflow-hidden', /overflow-hidden/, 'the scene does not clip (menus can overflow)')

// --- Scroll behavior (user feedback) ---------------------------------------
// Showcase at screen height: tabs are not visible at first; they stick on scroll, avatar + name only when stuck.
assert.match(read('src/pages/profile/ProfileShowcaseStage.tsx'), /min-h-\[calc\(100svh-5rem\)\][\s\S]{0,120}lg:min-h-\[calc\(100svh-1\.5rem\)\]/, 'showcase is screen height')
const tabsSource = read('src/pages/profile/ProfileStickyTabs.tsx')
assert.match(tabsSource, /stuck \? 'max-w-\[200px\] pr-1 opacity-100' : 'max-w-0 opacity-0'/, 'avatar + name only when the bar sticks')
assert.match(tabsSource, /sticky top-14 z-30[\s\S]{0,160}lg:top-0/, 'under the top bar on mobile, at the very top on desktop')
assert.match(page, /stuck=\{tabsStuck\}/)
// Tab change: while stuck a new tab starts from the top; content is at least one screen tall (the page does not jump).
assert.match(page, /const selectTab = \(next: ProfileLayoutTab\) => \{[\s\S]+window\.scrollTo\(\{ top: window\.scrollY \+ top - stickyTop\(\) \}\)/)
assert.match(page, /data-page-grid className="mt-6 grid min-h-\[calc\(100svh-7rem\)\][\s\S]{0,80}lg:min-h-\[calc\(100svh-3\.5rem\)\]/)
// No footer on the profile (ends with showcase + tabs).
assert.match(read('src/components/layout/Layout.tsx'), /location\.pathname\.startsWith\('\/profil\/'\)\s*\? null/)

// --- Sekmeler v2 ----------------------------------------------------------------------------
const v2 = read('supabase/migrations/20260930064610_profile_tabs_v2_modules_and_reading_summary.sql')
assert.match(v2, /'genres', 'level', 'teams', 'activity', 'none'\)/, 'new modules in the server rule')
assert.match(v2, /select coalesce\(access\.is_owner or access\.stats_visible, false\) into v_visible/, 'reading summary follows stats privacy')
assert.match(read('src/pages/profile/profileSlotData.ts'), /case 'activity': return data\.user\.activityFeed\.length > 0/)
const slotV2 = read('src/pages/profile/ProfileShowcaseSlot.tsx')
assert.match(slotV2, /picking && 'z-50'/, 'the module menu is above the tab bar (z-30)')
assert.match(slotV2, /max-h-\[min\(60vh,440px\)\] overflow-y-auto/, 'a long menu scrolls inside')
assert.match(slotV2, /openUp \? 'bottom-full mb-2' : 'top-full mt-2'/, 'opens upward if no room below')
const stage = read('src/pages/profile/ProfileShowcaseStage.tsx')
assert.match(stage, /content\.style\.opacity = String\(1 - progress \* 0\.85\)/, 'kaydirdikca vitrin soluklasir')
assert.match(stage, /prefers-reduced-motion: reduce/, 'hareket azaltma tercihine uyar')
assert.match(page, /<ProfileOverviewTab[\s\S]+onOpenTab=/)
assert.match(page, /<ProfileStatsTab[\s\S]+summary=\{readingSummary\.summary\}/)
assert.match(page, /useProfileReadingSummary\(controller\.user\?\.id, Boolean\(controller\.canViewProfileStats\)\)/)
assert.match(page, /<ProfileSideSummary user=\{controller\.user\} \/>/)
assert.match(read('src/pages/profile/ProfileOverviewTab.tsx'), /Bölüm \{item\.chapterNumber\}\{total \? ` \/ \$\{total\}` : ''\}/, 'okumaya devam gercek ilerleme')
assert.match(read('src/pages/profile/ProfileStatsTab.tsx'), /testId='profile-monthly-chart'/)

// --- Tabs v3 (one design language + reading rhythm) --------------------------------------------
const v3 = read('supabase/migrations/20260930120000_profile_tabs_v3_reading_rhythm.sql')
assert.match(v3, /select coalesce\(access\.is_owner or access\.stats_visible, false\) into v_visible/, 'rhythm data also follows stats privacy')
for (const key of ['daily', 'hourly', 'weekdays', 'topSeries']) assert.ok(v3.includes(`'${key}'`), `${key} in the summary`)
assert.match(v3, /where h\.user_id = p_user_id and m\.is_active and m\.is_approved/, 'only published series in most read')
const stats = read('src/pages/profile/ProfileStatsTab.tsx')
assert.match(stats, /testId='profile-reading-heatmap'/, '26 haftalik okuma takvimi')
assert.match(stats, /function readerPersona\(hourly: number\[\]\)/, 'okuma kisiligi saat dagilimindan')
for (const file of ['ProfileOverviewTab', 'ProfileStatsTab', 'ProfileCollectionTabs', 'ProfileListsTab', 'ProfileAboutTab']) {
  assert.match(read(`src/pages/profile/${file}.tsx`), /from '\.\/ProfileTabKit'/, `${file} ortak panel dilini kullanir`)
}
const tabsV3 = read('src/pages/profile/ProfileStickyTabs.tsx')
assert.match(tabsV3, /data-testid='profile-tab-indicator'/, 'a sliding line on the active tab')
assert.match(tabsV3, /box\.left - list\.getBoundingClientRect\(\)\.left \+ list\.scrollLeft/, 'the line position relates to the scrollable list (tab wrapper is relative)')
assert.match(page, /counts=\{tabCounts\}/, 'content counts next to the tab')
assert.match(page, /<main key=\{tab\}[^>]+animate-in fade-in-0/, 'content enters softly on tab change')

console.log('PASS profile showcase v3 (layout, slots, tabs, real progress)')
