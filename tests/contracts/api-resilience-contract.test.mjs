import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message)
  }
}

const helperSource = read('src/services/apiResilience.ts')
assertIncludes(helperSource, 'export async function withServiceTimeout', 'apiResilience helper withServiceTimeout exportunu korumali.')
assertIncludes(helperSource, 'export async function runWithRetry', 'apiResilience helper runWithRetry exportunu korumali.')

const accountCenterSource = read('src/services/accountCenterService.ts')
assertIncludes(accountCenterSource, 'withServiceTimeout', 'accountCenterService timeout korumasi kullanmali.')
assertIncludes(accountCenterSource, 'withAbortSignal', 'accountCenterService Supabase sorgularinda abort signal baglamali.')

const authSharedSource = read('src/services/authService/shared.ts')
assertIncludes(authSharedSource, 'withServiceTimeout', 'authService/shared timeout korumasi kullanmali.')
assertIncludes(authSharedSource, 'runWithRetry', 'authService/shared retry helper kullanmali.')
assertIncludes(authSharedSource, 'withAbortSignal', 'authService/shared Supabase query abort signal baglamali.')

const authSessionSource = read('src/services/authService/session.ts')
assertIncludes(authSessionSource, 'withServiceTimeout', 'authService/session timeout helper kullanmali.')

const authCredentialsSource = read('src/services/authService/credentials.ts')
assertIncludes(authCredentialsSource, 'withServiceTimeout', 'authService/credentials timeout helper kullanmali.')

const imageOptimizationSource = read('src/services/imageOptimizationService.ts')
assertIncludes(imageOptimizationSource, 'runWithRetry', 'imageOptimizationService data-url fetch icin retry helper kullanmali.')
assertIncludes(imageOptimizationSource, 'withServiceTimeout', 'imageOptimizationService data-url fetch icin timeout helper kullanmali.')

const adminSecurityAlertsSource = read('src/services/adminSecurityService/alerts.ts')
assertIncludes(adminSecurityAlertsSource, 'withServiceTimeout', 'adminSecurityService/alerts timeout helper kullanmali.')
assertIncludes(adminSecurityAlertsSource, 'withAbortSignal', 'adminSecurityService/alerts Supabase RPC cagrilarinda abort signal baglamali.')

const adminSecurityEventsSource = read('src/services/adminSecurityService/events.ts')
assertIncludes(adminSecurityEventsSource, 'withServiceTimeout', 'adminSecurityService/events timeout helper kullanmali.')
assertIncludes(adminSecurityEventsSource, 'withAbortSignal', 'adminSecurityService/events Supabase RPC cagrilarinda abort signal baglamali.')

const adminUserQueriesSource = read('src/services/adminUserService/queries.ts')
assertIncludes(adminUserQueriesSource, 'withServiceTimeout', 'adminUserService/queries timeout helper kullanmali.')
assertIncludes(adminUserQueriesSource, 'withAbortSignal', 'adminUserService/queries Supabase sorgularinda abort signal baglamali.')

const adminFansubMutationsSource = read('src/services/adminService/fansubs.mutations.ts')
assertIncludes(adminFansubMutationsSource, 'withServiceTimeout', 'adminService/fansubs.mutations timeout helper kullanmali.')
assertIncludes(adminFansubMutationsSource, 'withAbortSignal', 'adminService/fansubs.mutations Supabase sorgularinda abort signal baglamali.')

const adminMangaListMutationsSource = read('src/services/adminMangaListService/mutations.ts')
assertIncludes(adminMangaListMutationsSource, 'withServiceTimeout', 'adminMangaListService/mutations timeout helper kullanmali.')
assertIncludes(adminMangaListMutationsSource, 'withAbortSignal', 'adminMangaListService/mutations Supabase sorgularinda abort signal baglamali.')

const adminDashboardSource = read('src/services/adminService/shared.dashboard.ts')
assertIncludes(adminDashboardSource, 'withServiceTimeout', 'adminService/shared.dashboard timeout helper kullanmali.')
assertIncludes(adminDashboardSource, 'withAbortSignal', 'adminService/shared.dashboard Supabase sorgularinda abort signal baglamali.')

const badgePurchaseSource = read('src/services/badgeService/purchase.ts')
assertIncludes(badgePurchaseSource, 'withServiceTimeout', 'badgeService/purchase timeout helper kullanmali.')
assertIncludes(badgePurchaseSource, 'withAbortSignal', 'badgeService/purchase Supabase sorgularinda abort signal baglamali.')

const commentMutationsSource = read('src/services/commentService/mutations.ts')
assertIncludes(commentMutationsSource, 'withServiceTimeout', 'commentService/mutations timeout helper kullanmali.')
assertIncludes(commentMutationsSource, 'withAbortSignal', 'commentService/mutations Supabase yazma/okuma cagrilarinda abort signal baglamali.')

const commentSharedSource = read('src/services/commentService/shared.ts')
assertIncludes(commentSharedSource, 'withServiceTimeout', 'commentService/shared timeout helper kullanmali.')
assertIncludes(commentSharedSource, 'withAbortSignal', 'commentService/shared Supabase sorgularinda abort signal baglamali.')
assertIncludes(commentSharedSource, 'parseFansubIdentityTag', 'commentService/shared yorum yazari etiketini normalize etmeli.')


const userFollowsSource = read('src/services/userService/follows.ts')
assertIncludes(userFollowsSource, 'withServiceTimeout', 'userService/follows timeout helper kullanmali.')
assertIncludes(userFollowsSource, 'withAbortSignal', 'userService/follows Supabase follow sorgularinda abort signal baglamali.')

const userBlocksSource = read('src/services/userService/blocks.ts')
assertIncludes(userBlocksSource, 'withServiceTimeout', 'userService/blocks timeout helper kullanmali.')
assertIncludes(userBlocksSource, 'withAbortSignal', 'userService/blocks Supabase blok sorgularinda abort signal baglamali.')

const userPrivacySource = read('src/services/userService/privacy.ts')
assertIncludes(userPrivacySource, 'withServiceTimeout', 'userService/privacy timeout helper kullanmali.')
assertIncludes(userPrivacySource, 'withAbortSignal', 'userService/privacy Supabase sorgularinda abort signal baglamali.')

const userProfilesSource = read('src/services/userService/profiles.ts')
assertIncludes(userProfilesSource, 'withServiceTimeout', 'userService/profiles timeout helper kullanmali.')
assertIncludes(userProfilesSource, 'withAbortSignal', 'userService/profiles Supabase sorgularinda abort signal baglamali.')

const reportModerationSource = read('src/services/reportService/moderation.ts')
assertIncludes(reportModerationSource, 'withServiceTimeout', 'reportService/moderation timeout helper kullanmali.')
assertIncludes(reportModerationSource, 'withAbortSignal', 'reportService/moderation Supabase sorgularinda abort signal baglamali.')


const fansubManageChaptersSource = read('src/services/fansubManageService/chapters.ts')
assertIncludes(fansubManageChaptersSource, 'withServiceTimeout', 'fansubManageService/chapters timeout helper kullanmali.')
assertIncludes(fansubManageChaptersSource, 'withAbortSignal', 'fansubManageService/chapters Supabase sorgularinda abort signal baglamali.')

const fansubInvitesSource = read('src/services/fansubMembershipService/invites.ts')
assertIncludes(fansubInvitesSource, 'withServiceTimeout', 'fansubMembershipService/invites timeout helper kullanmali.')
assertIncludes(fansubInvitesSource, 'withAbortSignal', 'fansubMembershipService/invites Supabase sorgularinda abort signal baglamali.')

const fansubJoinRequestsSource = read('src/services/fansubMembershipService/joinRequests.ts')
assertIncludes(fansubJoinRequestsSource, 'withServiceTimeout', 'fansubMembershipService/joinRequests timeout helper kullanmali.')
assertIncludes(fansubJoinRequestsSource, 'withAbortSignal', 'fansubMembershipService/joinRequests Supabase sorgularinda abort signal baglamali.')

const mangaDetailsSource = read('src/services/mangaService/details.ts')
assertIncludes(mangaDetailsSource, 'withServiceTimeout', 'mangaService/details timeout helper kullanmali.')
assertIncludes(mangaDetailsSource, 'withAbortSignal', 'mangaService/details Supabase sorgularinda abort signal baglamali.')

const fansubCatalogSource = read('src/services/fansubService/catalog.ts')
assertIncludes(fansubCatalogSource, 'withServiceTimeout', 'fansubService/catalog timeout helper kullanmali.')
assertIncludes(fansubCatalogSource, 'withAbortSignal', 'fansubService/catalog Supabase sorgularinda abort signal baglamali.')

const fansubEconomySource = read('src/services/fansubService/economy.ts')
assertIncludes(fansubEconomySource, 'withServiceTimeout', 'fansubService/economy timeout helper kullanmali.')
assertIncludes(fansubEconomySource, 'withAbortSignal', 'fansubService/economy Supabase sorgularinda abort signal baglamali.')

const fansubRewardsSource = read('src/services/rewardService/fansubRewards.ts')
assertIncludes(fansubRewardsSource, 'withServiceTimeout', 'rewardService/fansubRewards timeout helper kullanmali.')
assertIncludes(fansubRewardsSource, 'withAbortSignal', 'rewardService/fansubRewards Supabase sorgularinda abort signal baglamali.')

const notificationPreferencesSource = read('src/services/notificationService/preferences.ts')
assertIncludes(notificationPreferencesSource, 'withServiceTimeout', 'notificationService/preferences timeout helper kullanmali.')
assertIncludes(notificationPreferencesSource, 'withAbortSignal', 'notificationService/preferences Supabase sorgularinda abort signal baglamali.')

const storeCatalogSource = read('src/services/storeService/catalog.ts')
assertIncludes(storeCatalogSource, 'withServiceTimeout', 'storeService/catalog timeout helper kullanmali.')
assertIncludes(storeCatalogSource, 'withAbortSignal', 'storeService/catalog Supabase sorgularinda abort signal baglamali.')

const shopServiceSource = read('src/services/shopService.ts')
assertIncludes(shopServiceSource, 'withServiceTimeout', 'shopService (Magaza v3) timeout helper kullanmali.')
assertIncludes(shopServiceSource, 'withAbortSignal', 'shopService (Magaza v3) RPC cagrilarinda abort signal baglamali.')

const mangaListMutationsSource = read('src/services/mangaListService/mutations.ts')
assertIncludes(mangaListMutationsSource, 'withServiceTimeout', 'mangaListService/mutations timeout helper kullanmali.')
assertIncludes(mangaListMutationsSource, 'withAbortSignal', 'mangaListService/mutations Supabase yazma/sorgu cagrilarinda abort signal baglamali.')

const fansubManagementSource = read('src/services/fansubMembershipService/management.ts')
assertIncludes(fansubManagementSource, 'withServiceTimeout', 'fansubMembershipService/management timeout helper kullanmali.')
assertIncludes(fansubManagementSource, 'withAbortSignal', 'fansubMembershipService/management Supabase sorgularinda abort signal baglamali.')

const fansubRequestsSource = read('src/services/fansubService/requests.ts')
assertIncludes(fansubRequestsSource, 'withServiceTimeout', 'fansubService/requests timeout helper kullanmali.')
assertIncludes(fansubRequestsSource, 'withAbortSignal', 'fansubService/requests Supabase sorgularinda abort signal baglamali.')

const mangaListCommentsSource = read('src/services/mangaListService/comments.ts')
assertIncludes(mangaListCommentsSource, 'withServiceTimeout', 'mangaListService/comments timeout helper kullanmali.')
assertIncludes(mangaListCommentsSource, 'withAbortSignal', 'mangaListService/comments Supabase sorgularinda abort signal baglamali.')

const mangaDiscoveryCatalogSource = read('src/services/mangaService/discovery.catalog.ts')
assertIncludes(mangaDiscoveryCatalogSource, 'withServiceTimeout', 'mangaService/discovery.catalog timeout helper kullanmali.')
assertIncludes(mangaDiscoveryCatalogSource, 'withAbortSignal', 'mangaService/discovery.catalog Supabase sorgularinda abort signal baglamali.')
console.log('PASS api resilience helper and critical service timeout/retry contract kept')

