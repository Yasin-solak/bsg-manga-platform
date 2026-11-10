import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const governanceSource = read('src/lib/fansubBoostCapabilityGovernance.ts')
const presentationSource = read('src/lib/fansubBoostPresentation.ts')
// Boost tab v2: the supporter summary is in tabs/FansubBoostPanels (instead of the old FansubBoostSidebar).
const sidebarSource = read('src/pages/fansub/tabs/FansubBoostPanels.tsx')
const wallSource = read('src/pages/fansub/FansubSupporterWall.tsx')
const previewSource = read('src/components/fansub/FansubSupporterPreview.tsx')
const chapterCreditSource = read('src/components/fansub/chapterCreditPresentation.ts')
const chapterCreditRailSource = read('src/components/fansub/ChapterEndCreditRail.tsx')
const showcaseHeroSource = read('src/pages/fansub/FansubShowcaseHero.tsx')
const directoryCardSource = read('src/pages/fansubs/FansubDirectoryCard.tsx')
const showcaseRailSource = read('src/pages/fansubs/FansubShowcaseRail.tsx')
const leaderboardSource = read('src/pages/fansubs/FansubLeaderboardPanel.tsx')
const vanitySource = read('src/components/fansub/FansubVanityUrlSection.tsx')
const noticesSource = read('src/pages/fansubYonet/FansubYonetNoticesTab.tsx')

assert.match(governanceSource, /export function canRenderFansubSupporterSummary/)
assert.match(governanceSource, /export function canRenderFansubDiscoverBadge/)
assert.match(governanceSource, /export function canRenderFansubGoldFrame/)
assert.match(governanceSource, /export function canUseFansubVanityUrl/)
assert.match(governanceSource, /export function canRenderFansubSupporterStreakIdentity/)
assert.match(governanceSource, /export function canRenderFansubFoundingSupporterIdentity/)

assert.match(presentationSource, /resolveFansubBoostSupporterIdentityBadgeLabel/)
assert.match(presentationSource, /canRenderFansubFoundingSupporterIdentity/)
assert.match(presentationSource, /canRenderFansubSupporterStreakIdentity/)

assert.match(sidebarSource, /canRenderFansubSupporterSummary/)
assert.match(sidebarSource, /testId='fansub-boost-supporters'/)
assert.match(sidebarSource, /\{canShowSupporterSummary \? \(\s*<SupportersPanel/, 'supporter panel only if permitted')
assert.match(sidebarSource, /resolveFansubBoostSupporterStatusLine\(supporterState\.rewardCapabilities, snapshot\?\.capabilities\)/)

assert.match(wallSource, /canRenderFansubSupporterSummary/)
assert.match(wallSource, /resolveFansubBoostSupporterIdentityBadgeLabel/)
assert.match(wallSource, /data-testid="fansub-supporter-wall"/)
assert.match(wallSource, /if \(!canShowSupporterSummary\) return null/)

assert.match(previewSource, /canRenderFansubSupporterSummary/)
assert.match(previewSource, /resolveFansubBoostSupporterIdentityBadgeLabel/)
assert.match(previewSource, /data-testid="fansub-supporter-preview"/)
assert.match(previewSource, /if \(!snapshot \|\| snapshot\.activeSupporterCount <= 0 \|\| !canShowSupporterSummary\) return null/)

assert.match(chapterCreditSource, /canRenderFansubDiscoverBadge/)
assert.match(chapterCreditSource, /canRenderFansubGoldFrame/)
assert.match(chapterCreditSource, /resolveFansubBoostSupporterIdentityBadgeLabel/)

assert.match(chapterCreditRailSource, /data-has-discover-badge/)
assert.match(chapterCreditRailSource, /data-has-gold-frame/)
assert.match(chapterCreditRailSource, /data-supporter-count/)
assert.match(chapterCreditRailSource, /data-is-minimal/)

assert.match(showcaseHeroSource, /canRenderFansubDiscoverBadge/)
assert.match(showcaseHeroSource, /canRenderFansubGoldFrame/)
assert.match(showcaseHeroSource, /data-testid="fansub-showcase-hero"/)

assert.match(directoryCardSource, /data-testid=\{`fansub-directory-card-\$\{fansub\.slug \|\| fansub\.id\}`\}/)
assert.match(directoryCardSource, /data-name-style-mode=\{hasStyledName \? 'styled' : 'plain'\}/)

assert.match(showcaseRailSource, /data-testid="weekly-chapter-leader-card"/)
assert.match(showcaseRailSource, /data-name-style-mode=\{hasStyledName \? 'styled' : 'plain'\}/)

assert.match(leaderboardSource, /data-testid=\{`fansub-trend-row-\$\{fansub\.slug \|\| fansub\.id\}`\}/)
assert.match(leaderboardSource, /data-testid=\{`fansub-recent-row-\$\{fansub\.slug \|\| fansub\.id\}`\}/)
assert.match(leaderboardSource, /data-testid=\{`fansub-recommended-row-\$\{fansub\.slug \|\| fansub\.id\}`\}/)
assert.match(leaderboardSource, /data-name-style-mode=\{hasStyledName \? 'styled' : 'plain'\}/)

assert.match(vanitySource, /data-testid="fansub-vanity-url-section"/)
assert.match(vanitySource, /data-vanity-lock-mode=/)

assert.match(noticesSource, /canManagePinnedNotice = boostSnapshot\?\.capabilities\?\.canManagePinnedNotice === true/)
assert.match(noticesSource, /canUseSpecialNotifications = boostSnapshot\?\.capabilities\?\.canUseSpecialNotifications === true/)
assert.match(noticesSource, /NoticeLockCard/)

console.log('PASS fansub boost capability governance matrix kept across all surfaces')
