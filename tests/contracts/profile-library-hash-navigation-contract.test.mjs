import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

/**
 * Profile library navigation contract.
 *
 * Architecture history:
 * - v5/v6: `okuma-gecmisi`, `favoriler`, `indirdiklerim`, `notlarim` hash targets in ProfilePage.
 * - end of v6: `indirdiklerim` and `notlarim` removed (user request).
 * - v8: `Continue` info moved to the profile page's sticky right sidebar.
 * The `okuma-gecmisi` hash target was removed; the "My Reading History" link in AppSidebar
 * now goes to the `/profil/<username>` main page (Continue shows right away in the
 * sticky sidebar).
 * - v9: library links in AppSidebar ("My Reading History" + "My Favorites")
 * were fully removed; the active seasonal event surface replaced them.
 * The profile page still supports the #favoriler section by direct URL.
 *
 * - v10 (prototype v3): the right sidebar went away. Continue info moved to the "Reading now" slot in the profile
 * showcase (ProfileShowcaseSlot, reading module);
 * genre distribution is in the tab content's right column.
 *
 * This test verifies the v10 architecture: no sidebar library links + an event
 * surface; the ProfilePage #favoriler target and showcase Continue flow are kept.
 */

const root = process.cwd()
const profilePageSource = fs.readFileSync(path.join(root, 'src/pages/ProfilePage.tsx'), 'utf8')
const sidebarSource = fs.readFileSync(path.join(root, 'src/components/layout/AppSidebar.tsx'), 'utf8')
const showcaseSlotSource = fs.readFileSync(path.join(root, 'src/pages/profile/ProfileShowcaseSlot.tsx'), 'utf8')
const profileDataLoadersSource = fs.readFileSync(path.join(root, 'src/pages/profile/profileDataLoaders.ts'), 'utf8')

// AppSidebar v9: kutuphane linkleri sidebar'dan kaldirildi (yerine etkinlik yuzeyi)
assert.doesNotMatch(
  sidebarSource,
  /Okuma Geçmişim/,
  'app sidebar should no longer render the reading-history library link (v9: replaced by event surface)',
)
assert.doesNotMatch(
  sidebarSource,
  /Favorilerim/,
  'app sidebar should no longer render the favorites library link (v9: replaced by event surface)',
)

// AppSidebar v9: the active event surface replaces removed links
// (a single-owner EventQuestsPanel dialog -> double opening is prevented)
assert.match(
  sidebarSource,
  /EventQuestsPanel/,
  'app sidebar should render the active-event surface (EventQuestsPanel) in a single owned dialog (v9)',
)

// ProfilePage v8: `favoriler` stays as the only valid library hash target
assert.match(
  profilePageSource,
  /id="favoriler"[\s\S]+data-profile-section="favoriler"/,
  'profile page should render a concrete favoriler hash target',
)

// ProfilePage v8: hash targets return to the overview tab and call scrollIntoView
assert.match(
  profilePageSource,
  /PROFILE_LIBRARY_HASH_TARGETS[\s\S]+setActiveTab\('overview'\)[\s\S]+scrollIntoView/,
  'profile hash navigation should switch back to overview and scroll to the requested library section',
)

// v10: Devam Et bilgisi (reading history) vitrin yuvasina, tur dagilimi sag sutuna gider
assert.match(
  profilePageSource,
  /const slotData = \{ user: controller\.user,[\s\S]+<ProfileShowcaseStage[\s\S]+data=\{slotData\}/,
  'profile page should pass the profile user (reading history) to the showcase slots',
)
assert.match(
  profilePageSource,
  /<ProfileGenreRings favoriteGenres=\{controller\.user\.favoriteGenres/,
  'profile page should keep the favorite genre rings in the right column',
)
assert.match(
  showcaseSlotSource,
  /const cover = [\s\S]+buildCoverPlaceholder\(title\)[\s\S]+const item = user\.readingHistory\[0\][\s\S]+cover\(item\.coverImage, item\.title\)/,
  'showcase reading module should use the latest reading history row with the local cover placeholder fallback',
)

// Profile data loader: reading history still loads lazily with canViewActivity
assert.match(
  profileDataLoadersSource,
  /canViewActivity\s*\?\s*userService\.getReadingHistory\(profileId\)/,
  'profile library should hydrate real reading_history rows when activity is visible',
)

// Profile data loader: the activity feed reuses reading history (no empty feed)
assert.match(
  profileDataLoadersSource,
  /userService\.getActivityFeed\(profileId,\s*\{[\s\S]+recentHistory:\s*historyResult\.status === 'fulfilled' \? history : null/,
  'profile activity sidebar should reuse the loaded reading history instead of rendering an always-empty feed',
)

console.log('profile-library-hash-navigation-contract: ok')
