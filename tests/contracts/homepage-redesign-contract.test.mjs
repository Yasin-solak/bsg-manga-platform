import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function run(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

run('homepage keeps the reference showcase and right rail contract', () => {
  const homePageSource = readSource('src/pages/HomePage.tsx')
  const heroSource = readSource('src/components/home/HomeHero.tsx')
  const latestSource = readSource('src/components/home/HomeNewChapters.tsx')
  const rightSidebarSource = readSource('src/components/home/HomeRightSidebar.tsx')
  const typesSource = readSource('src/services/homeService/types.ts')
  const feedSource = readSource('src/services/homeService/feed.ts')

  // Old community post highlights were removed; the home feed only carries announcements.
  assert.doesNotMatch(typesSource, /HomeCommunityHighlights|communityPosts/)
  assert.doesNotMatch(feedSource, /communityHighlights|listCommunityPosts/)
  assert.match(feedSource, /p_popular_post_limit: 0/)
  assert.match(heroSource, /ÖNE ÇIKAN SERİ/)
  assert.match(heroSource, /Okumaya Başla/)
  assert.match(heroSource, /Detaylar/)
  assert.match(latestSource, /YENİ BÖLÜMLER/)
  assert.match(latestSource, /Bugün/)
  assert.match(latestSource, /Dün/)
  assert.match(latestSource, /Bu Hafta/)
  assert.match(rightSidebarSource, /<AnnouncementsPanel/)
  assert.match(rightSidebarSource, /currentStreak=\{readingStreakDays\}/)
  assert.doesNotMatch(rightSidebarSource, /<PremiumCard/)
  assert.match(readSource('src/components/home/HomePremiumCard.tsx'), /getActivePremiumOffer/)
  assert.match(readSource('src/components/layout/AppSidebar.tsx'), /enableSearchHotkey && !mini \? <HomePremiumCard/)
  assert.match(rightSidebarSource, /mz:open-desktop-home-quests/)
  assert.doesNotMatch(homePageSource, /DiscussionHighlightsSection/)
  assert.doesNotMatch(homePageSource, /HomeQuickGenres/)
  assert.doesNotMatch(homePageSource, /<HomeShowcase/)
  assert.doesNotMatch(homePageSource, /HomeLatestUpdates/)
  assert.doesNotMatch(homePageSource, /HomeInfoCards/)
  assert.doesNotMatch(homePageSource, /communityLimit|communityHighlights/)
  assert.match(homePageSource, /<HomeHero mangas=\{heroManga\.slice\(0, LIMITS\.hero\)\} loading=\{[^\n]+\} \/>/)
  assert.match(homePageSource, /<HomeContinueReading/)
  assert.match(homePageSource, /<HomeTrendingGrid mangas=\{trendingManga\} loading=\{feedLoading\} \/>/)
  assert.match(homePageSource, /<HomeNewChapters chapters=\{latestChapters\} loading=\{chaptersLoading\} \/>/)
  assert.match(homePageSource, /<HomeNewChapters chapters=\{latestChapters\} loading=\{chaptersLoading\} \/>\s*<HomeTrendingGrid/)
  assert.match(homePageSource, /getPublicExploreConfig/)
  assert.match(homePageSource, /getGenreCounts/)
  assert.match(homePageSource, /navigate\(`\/kesfet\?\$\{params\.toString\(\)\}`\)/)
  assert.doesNotMatch(homePageSource, /<HomeCommunityCorner/)
  assert.match(homePageSource, /<HomeRightSidebar/)
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
