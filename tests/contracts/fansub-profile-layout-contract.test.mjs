import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The fansub page uses the same layout as the user profile: a shared showcase scene (card in the center, modules on
// both sides, a "more" button), a sticky tab bar below (avatar + name when stuck),
// tab content and a right column. The profile keeps using the same scene.
// Line endings (CRLF/LF) should not affect patterns.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const stage = read('src/pages/profile/ProfileShowcaseStage.tsx')
assert.match(stage, /export function ShowcaseStage\(/, 'ortak vitrin sahnesi')
assert.match(stage, /<ShowcaseStage\n\s+card=\{card\}\n\s+left=\{slot\('left'\)\}/, 'profil ortak sahneyi kullanir')

const page = read('src/pages/FansubDetailPage.tsx')
assert.match(page, /<ShowcaseStage\n\s+testId="fansub-showcase-stage"/, 'fansub vitrini ortak sahnede')
assert.match(page, /left=\{<FansubStageRecentChapters chapters=\{controller\.chapterPreviews\} onShowAll=\{\(\) => openTab\(FANSUB_DETAIL_RELEASES_TAB\)\} \/>\}/, 'left slot: latest chapters (All -> tab)')
assert.match(page, /backdrop=\{stageBg \? null : <FansubCoverWall mangas=\{controller\.sortedMangas\} \/>\}/, 'arka plansiz fansubda kapak duvari')
assert.match(page, /bg=\{stageBg \?\? coverAmbience\(controller\.sortedMangas\)\}/, 'arka plansiz fansubda kapak isigi')
assert.match(page, /<FansubStageSeries\n/, 'right slot: series + team')
assert.match(page, /const stageBg = toStageBackground\(controller\.effectiveBg\)/, 'sahne zemini fansub arka plani')
assert.match(page, /const stageTheme = toStageTheme\(controller\.fansub\.hoverTheme, controller\.boostSnapshot\?\.capabilities\)/, 'scene color is the fansub theme')
assert.match(page, /theme=\{stageTheme\}/, 'the scene paints with the theme')
assert.match(page, /themeColors=\{stageTheme\}/, 'the card body uses the same theme')
assert.match(read('src/pages/fansub/fansubStageMedia.ts'), /if \(capabilities\?\.canUseHoverTheme !== true\) return null/, 'theme is a boost perk: scene is neutral on expiry')
assert.match(page, /stage=\{\{\n\s+onTop: scrollToTop,/, 'return to the showcase from the tab bar')
assert.match(page, /<FansubSideSummary\n/, 'summary + team in the right column')
assert.doesNotMatch(page, /lg:grid-cols-\[320px_minmax\(0,1fr\)\]/, 'the old left sticky card layout does not come back')

const tabs = read('src/pages/fansub/FansubContentTabs.tsx')
assert.match(tabs, /className="sticky top-14 z-30 [^"]*lg:top-0"/, 'the tab bar is sticky (under the top bar on mobile)')
assert.match(tabs, /stuck \? 'max-w-\[200px\] pr-1 opacity-100' : 'max-w-0 opacity-0'/, 'avatar + name show when stuck')
assert.match(tabs, /shadow-\[0_0_14px_hsl\(var\(--primary\)\/0\.7\)\]/, 'a glowing line on the active tab (same as profile)')
assert.match(tabs, /xl:grid-cols-\[minmax\(0,1fr\)_320px\]/, 'icerik + sag sutun')
assert.match(tabs, /setSearchParams\(buildNextSearchParams\(searchParams, nextTab, defaultTab\), \{ replace: true \}\)/, 'tabs still deep link with ?tab=')

const media = read('src/pages/fansub/fansubStageMedia.ts')
assert.match(media, /if \(!bg \|\| bg\.mediaType === 'video'\) return null/, 'a video background does not move to the scene (plays on the card)')
const modules = read('src/pages/fansub/FansubStageModules.tsx')
assert.match(modules, /chapters\.filter\(\(chapter\) => !chapter\.isPending\)\.slice\(0, 4\)/, 'a pending chapter does not show in the showcase')
assert.match(modules, /const NEW_WINDOW_MS = 3 \* DAY_MS/, 'chapters of the last 3 days are NEW')
assert.match(modules, /if \(covers\.length < 2\) return null/, 'no wall from a single cover')

// Tabs v2: each tab in a separate file, in the profile tab language (Panel / PanelEmpty); no outer card.
const TAB_FILES = ['FansubBoostPanels', 'FansubNoticesTab', 'FansubMangasTab', 'FansubTeamTab', 'FansubReleasesTab', 'FansubScheduleTab']
for (const name of TAB_FILES) {
  const source = read(`src/pages/fansub/tabs/${name}.tsx`)
  assert.match(source, /from '\.\.\/\.\.\/profile\/ProfileTabKit'/, `${name}: profile tab language`)
  assert.match(source, /<Panel\b/, `${name}: panel`)
}
assert.match(tabs, /<main key=\{activeTab\} className="min-w-0 animate-in/, 'tab content has no outer card')
const mangasTab = read('src/pages/fansub/tabs/FansubMangasTab.tsx')
assert.match(mangasTab, /canSeePending \? mangas : mangas\.filter\(\(manga\) => !manga\.isPendingOwned\)/, 'a pending series only to authorized people')
const boostPanels = read('src/pages/fansub/tabs/FansubBoostPanels.tsx')
assert.match(boostPanels, /canRenderFansubSupporterSummary\(snapshot\?\.capabilities, snapshot \? 'resolved' : 'unknown'\)/, 'supporter summary with a permission gate')
assert.match(boostPanels, /supporters=\{canShowSupporterSummary \? /, 'hero supporter avatars with a permission gate too')

console.log('PASS Fansub profile layout: shared showcase scene, sticky tabs, right column, tabs v2')
