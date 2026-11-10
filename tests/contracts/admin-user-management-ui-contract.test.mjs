import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { untranslate } from './i18n-source.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  const absolutePath = path.join(rootDir, relativePath)
  assert.equal(existsSync(absolutePath), true, `${relativePath} bulunamadi`)
  return untranslate(readFileSync(absolutePath, 'utf8'))
}

const section = readSource('src/components/admin/AdminUsersSection.tsx')
const views = readSource('src/components/admin/users/usersSectionViews.ts')
const pane = readSource('src/components/admin/users/UserDetailPane.tsx')
const banDialog = readSource('src/components/admin/users/AdminUserBanDialog.tsx')
const viewsMigration = readSource('supabase/migrations/20261103140000_admin_users_v2_views.sql')
const trustBreakdown = readSource('src/components/admin/users/AdminUserTrustBreakdown.tsx')
const trustDetailCard = readSource('src/components/admin/users/AdminUserTrustDetailCard.tsx')
const detailModal = readSource('src/components/admin/users/AdminUserDetailModal.tsx')
const detailHeader = readSource('src/components/admin/users/AdminUserDetailHeader.tsx')
const detailOverview = readSource('src/components/admin/users/AdminUserDetailOverview.tsx')
const detailDataTabs = readSource('src/components/admin/users/AdminUserDetailDataTabs.tsx')
const detailOwnerships = readSource('src/components/admin/users/AdminUserDetailOwnerships.tsx')
const detailInsightsTabs = readSource('src/components/admin/users/AdminUserDetailInsightsTabs.tsx')
const detailTabs = readSource('src/components/admin/users/adminUserDetailTabs.ts')
const userUtils = readSource('src/components/admin/users/adminUsersUtils.ts')
const serviceExports = readSource('src/services/adminUserService/index.ts')
const userTypes = readSource('src/services/adminUserTypes.ts')
const queries = readSource('src/services/adminUserService/queries.ts')
const serviceShared = readSource('src/services/adminUserService/shared.ts')
const detailRpc = readSource('src/services/adminUserDetailService/rpc.ts')
const insightsService = readSource('src/services/adminUserInsightsService.ts')
const detailFallbackMap = readSource('src/services/adminUserDetailService/fallback.map.ts')
const overview = readSource('src/services/adminUserService/overviewSnapshot.ts')
const mutations = readSource('src/services/adminUserService/mutations.ts')
const presenceService = readSource('src/services/userPresenceService.ts')
const authContext = readSource('src/contexts/AuthContext.tsx')
const e2eMocks = readSource('src/testing/e2eMocks.ts')
const adminUsersE2e = readSource('src/testing/adminUsersE2e.ts')

const userManagementUi = [
  section,
  views,
  pane,
  banDialog,
  trustBreakdown,
  trustDetailCard,
  detailModal,
  detailHeader,
  detailOverview,
  detailDataTabs,
  detailOwnerships,
  detailInsightsTabs,
  detailTabs,
].join('\n')

// Users v2 desk (2026-11-03): summary strip = view (filtered on the server,
// count from the server summary), paged list + selected account panel
// (on the right at desk size, a Sheet on narrow screens).
assert.match(views, /export type AdminUsersView = 'all' \| 'new' \| 'staff' \| 'review' \| 'banned'/)
for (const [id, label] of [
  ['all', 'T\u00fcm kullan\u0131c\u0131lar'],
  ['new', 'Yeni \\(7 g\u00fcn\\)'],
  ['staff', 'Yetkililer'],
  ['review', '\u0130ncelenmeli'],
  ['banned', 'Banl\u0131'],
]) {
  assert.match(views, new RegExp(`id: '${id}', label: '${label}'`), `${label} view must be kept`)
}
assert.match(views, /count: \(o\) => o\.lowTrustReview \?\? null/, 'the To review count is the low confidence count in the summary')
assert.match(views, /count: \(o\) => o\.banned \?\? null/)
assert.match(section, /const value = overview \? view\.count\(overview\) : null/)
assert.match(section, /view: activeView/)
assert.match(section, /overview\?\.activeLast30Days/)
assert.match(section, /overview\?\.onlineNow/)
assert.match(section, /useDeskLayout\(\)/)
assert.match(section, /xl:grid-rows-\[minmax\(0,1fr\)\]/)
assert.match(section, /min-h-0 divide-y divide-border\/50 overflow-y-auto/)
assert.match(section, /onOpenAutoFocus=\{focusSheetContainer\}/)
assert.match(section, /G\u00f6r\u00fcnen ad, @kullan\u0131c\u0131 ad\u0131, kimlik ya da e-posta/)

// Views on the server: the count in the summary and the condition in the list are the same.
assert.match(viewsMigration, /v_view not in \('all', 'admin', 'moderator', 'user', 'new', 'staff', 'banned', 'review'\)/)
assert.match(viewsMigration, /v_view = 'review'\s+and trust\.score < 60\s+and trust\.confidence <> 'low'/)
assert.match(viewsMigration, /'banned', \(/)
assert.match(overview, /banned: z\.number\(\)\.int\(\)\.nonnegative\(\)\.optional\(\)/)
assert.match(queries, /view: z\.enum\(\['all', 'admin', 'moderator', 'user', 'new', 'staff', 'banned', 'review'\]\)\.optional\(\)/)

assert.doesNotMatch(userManagementUi, /Fansub Ata/i, 'user selection must not offer an Assign Fansub action')

// Role, unban and bulk actions go through a dialog explaining the result.
assert.match(section, /<AdminConfirmDialog/)
assert.doesNotMatch(section, /confirmDialog\(/, 'AdminConfirmDialog instead of native/old confirm')
assert.match(section, /Ban kayd\u0131 moderasyon ge\u00e7mi\u015finde kal\u0131r/)
assert.match(views, /consequence: 'Y\u00f6netim paneline tam eri\u015fim kazan\u0131r/)
assert.match(section, /Banla \(\{bannableCount\}\)/)
assert.match(section, /Ban\u0131 kald\u0131r \(\{bannedCount\}\)/)
assert.match(
  section,
  /selectedUsers\.filter\(\(user\) => !user\.isBanned && user\.id !== currentUserId\)\.length/,
  'the bulk ban counter must directly exclude the current user',
)
assert.match(section, /setAdminUsersBanState\(\{/)
assert.match(section, /user\.id !== currentUserId/)
assert.match(section, /user\.id === currentUserId && nextRole !== 'admin'/, 'Kendi admin rolunu dusurme engeli')

// Banning yourself / lowering your own role is closed in the panel too.
assert.match(pane, /disabled=\{busy \|\| isSelf\}/)
assert.match(pane, /const blocked = isSelf && option\.id !== 'admin'/)

// Ban dialog: reason required, duration from presets or a date.
assert.match(banDialog, /banReason\.trim\(\)\.length >= 3/)
assert.match(banDialog, /\{ id: 'permanent', label: 'Kal\u0131c\u0131' \}/)
assert.match(banDialog, /disabled=\{isBusy \|\| !reasonValid \|\| customInvalid\}/)

assert.match(pane, /onOpenDetail\('fansub'\)/)
assert.match(pane, /onOpenDetail\('profil'\)/)
assert.match(section, /initialTab=\{detailInitialTab\}/)
assert.match(detailModal, /initialTab\?: AdminUserDetailTab/)
for (const tab of ['profil', 'aktivite', 'okuma', 'fansub', 'yorumlar', 'sahiplikler', 'moderasyon']) {
  assert.match(detailTabs, new RegExp(`value: '${tab}'`), `${tab} detail tab must be kept`)
}
assert.match(detailModal, /showCloseButton=\{false\}/)
assert.match(detailModal, /sm:h-\[min\(89dvh,51\.5rem\)\]/)
assert.match(detailModal, /data-testid="admin-user-detail-content"/)
assert.doesNotMatch(detailModal, /overflow-y-scroll/, 'the detail modal must not force vertical scrolling while content fits')
assert.match(`${detailModal}\n${detailHeader}`, /aria-label="Detayl\u0131 kullan\u0131c\u0131 bilgilerini kapat"/)

assert.match(views, /export const USERS_PER_PAGE = 20\b/)
assert.match(serviceShared, /export const DEFAULT_LIMIT = 10\b/)
assert.match(serviceShared, /export const MAX_LIMIT = 20\b/)
assert.match(queries, /limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(20\)\.optional\(\)/)
assert.match(viewsMigration, /if v_limit < 1 or v_limit > 20 then/)
assert.match(section, /Math\.ceil\(totalCount \/ USERS_PER_PAGE\)/)
assert.match(section, /limit: USERS_PER_PAGE/)
assert.match(userUtils, /export function getUserTrust/)
assert.match(userUtils, /export function getUserPresence/)
assert.match(userUtils, /export function getUserDisplayName/)
assert.match(userUtils, /user\.displayName\?\.trim\(\) \|\| user\.username/)
assert.match(userTypes, /interface AdminManagedUser[\s\S]{0,400}?displayName\?: string/)
assert.match(userTypes, /interface AdminUserDetail[\s\S]{0,260}?displayName\?: string/)
assert.match(serviceShared, /readString\(row, 'displayName', 'display_name'\) \|\| username/)
assert.match(queries, /displayName: z\.string\(\)\.min\(1\)\.nullable\(\)\.optional\(\)/)
assert.match(queries, /display_name: z\.string\(\)\.min\(1\)\.nullable\(\)\.optional\(\)/)
assert.match(section, /\{getUserDisplayName\(user\)\}<\/span>[\s\S]{0,500}?@\{user\.username\}/)
assert.match(pane, /\{getUserDisplayName\(user\)\}<\/h2>[\s\S]{0,120}?@\{user\.username\}/)
assert.match(`${detailModal}\n${detailHeader}`, /detail\.profile\.displayName\?\.trim\(\) \|\| detail\.profile\.username/)
assert.match(detailOverview, /Görünen ad/)
assert.match(detailOverview, /Kullanıcı etiketi/)
assert.match(detailFallbackMap, /displayName: profileRow\.display_name\?\.trim\(\) \|\| profileRow\.username/)
assert.match(detailRpc, /supabase\.rpc\('get_admin_user_detail_v2'/)
assert.match(detailRpc, /isRpcMissingFunctionError\(preferred\.error\)[\s\S]{0,120}?supabase\.rpc\('get_admin_user_detail'/)
assert.match(pane, /to=\{`\/profil\/\$\{encodeURIComponent\(user\.username\)\}`\}/)
assert.match(userUtils, /user\.lastActivityAt \?\? user\.lastSeenAt/)
assert.doesNotMatch(userUtils, /lastActivityAt[^\n]*updatedAt|updatedAt[^\n]*lastActivityAt/)
assert.match(pane, /presenceDotClass\(presence\.status\)/)
assert.doesNotMatch(pane, /AdminUserTrustBreakdown|AdminUserProgressionCard|G\u00fcven Skoru/)
assert.match(detailOverview, /<AdminUserProgressionDetail progression=\{progression\} \/>/)
assert.match(detailOverview, /<AdminUserTrustDetailCard trust=\{trust\} \/>/)
assert.match(detailModal, /const trust = user \? getUserTrust\(user\) : null/)
assert.match(`${detailOverview}\n${detailDataTabs}`, /gerçek süre telemetrisi|Geçici kısıtlama/)
assert.match(detailOwnerships, /yalnızca kullanıcı envanterinde doğrulanan sahiplikleri/)
assert.match(detailOwnerships, /MAX_VISIBLE_OWNERSHIPS = 3/)
assert.match(detailOwnerships, /MAX_VISIBLE_BADGES = 4/)
assert.match(detailOwnerships, /ek sahiplik/)
assert.match(detailModal, /getAdminUserDetailInsights\(userId, \{ forceRefresh \}\)/)
assert.match(detailModal, /<AdminUserActivityTab insights=\{insights\}/)
assert.match(detailModal, /<AdminUserModerationTab insights=\{insights\}/)
assert.match(detailModal, /<AdminUserReadingTab detail=\{detail\} insights=\{insights\}/)
assert.match(detailInsightsTabs, /\(\[7, 30\] as const\)/)
assert.match(detailInsightsTabs, /\{days\} Gün/)
assert.match(detailInsightsTabs, /Aktif Saatler/)
assert.match(detailInsightsTabs, /Denetlenebilir Olay Akışı/)
assert.match(detailInsightsTabs, /xl:grid-cols-\[11\.5rem_minmax\(0,1fr\)_17rem\]/)
assert.match(detailDataTabs, /lg:grid-cols-\[1\.35fr_0\.95fr_0\.8fr\]/)
assert.match(detailInsightsTabs, /Oturum açma için güvenilir olay kaynağı bulunmadığından/)
assert.doesNotMatch(detailInsightsTabs, /Aktivite Skoru|Topluluk Katkısı|Olumlu Etkileşim Oranı/)
assert.match(insightsService, /z\.object\(\{/)
assert.match(insightsService, /\.strict\(\)/)
assert.match(insightsService, /supabase\.rpc\('get_admin_user_detail_insights'/)
assert.match(insightsService, /withServiceTimeout\(/)
assert.match(insightsService, /if \(isMissingInsightsRpc\(error\)\) return null/)
assert.match(trustDetailCard, /G\u00fcven Skoru/)
assert.match(trustDetailCard, /<AdminUserTrustBreakdown trust=\{trust\} \/>/)
assert.match(trustDetailCard, /trustConfidenceLabel\(trust\.confidence\)/)
assert.match(userUtils, /components: normalizeTrustComponents\(user\.trust\?\.components\)/)
assert.match(userUtils, /export function getTrustScoreFactors/)
for (const serverComponent of [
  'baseline',
  'emailVerification',
  'accountTenure',
  'cleanObservation',
  'confirmedBanPenalty',
  'activeBanOverride',
  'accountAgeDays',
  'confirmedBanCount',
]) {
  assert.match(userUtils, new RegExp(`\\b${serverComponent}\\b`), `${serverComponent} guven bileseni korunmali`)
}
assert.match(userUtils, /reasons\.has\('ACTIVE_BAN'\)/)
assert.match(userUtils, /nihai g\u00fcven skoru 0 olarak sabitlendi/)
assert.match(trustBreakdown, /G\u00fcven skoru art\u0131 ve eksi puanlar\u0131/)
assert.match(trustBreakdown, /factorPointsAriaLabel/)
assert.doesNotMatch(
  trustBreakdown,
  /reduce\s*\(/,
  'the server score must not be recomputed from factors on the client',
)
assert.match(presenceService, /supabase\.rpc\('touch_my_presence'/)
assert.match(presenceService, /presenceRequestInFlight/)
assert.match(authContext, /PRESENCE_HEARTBEAT_INTERVAL_MS = 60_000/)
assert.match(authContext, /document\.visibilityState === 'visible'/)
assert.match(authContext, /window\.setInterval\(sendHeartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS\)/)
assert.match(queries, /lastActivityAt: isoTimestampSchema\.nullable\(\)/)
assert.match(queries, /lastSeenAt: isoTimestampSchema\.nullable\(\)\.optional\(\)/)
assert.match(queries, /presenceStatus: z\.enum\(\['online', 'idle', 'offline', 'unknown', 'blocked'\]\)/)
assert.match(queries, /trust: trustPayloadSchema/)
assert.match(queries, /const previewPayloadSchema = z\.object\(\{/)
assert.match(queries, /previewPayloadSchema\.parse\(/)
assert.match(queries, /capabilities: z\.object\(\{/)
assert.match(queries, /search\.includes\('@'\)/)
assert.match(queries, /Boolean\(normalizedParams\.cursor\)/)
assert.match(queries, /\.strict\(\)/, 'RPC and filter schemas must reject unknown fields')
assert.match(mutations, /const uuidSchema = z\.string\(\)[\s\S]{0,120}?\.toLowerCase\(\)/)
assert.match(mutations, /resultIds\.size !== result\.items\.length/)
assert.match(mutations, /result\.updated !== updated \|\| result\.unchanged !== unchanged \|\| result\.rejected !== rejected/)
assert.match(mutations, /normalizeBulkMutationResult\(e2eResult, userIds\)/)
assert.doesNotMatch(mutations, /normalizeBulkMutationResult\(null/)
assert.match(
  mutations,
  /isMissingRpcError\(error\) && userIds\.length === 1 && !normalized\.isBanned/,
  'the legacy single RPC must remain only as a safe unban fallback',
)

const canonicalE2EAdminId = e2eMocks.match(/export const E2E_ADMIN_USER_ID = '([^']+)'/)?.[1]
assert.match(canonicalE2EAdminId || '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
assert.match(e2eMocks, /function getDefaultE2EMockAuthUser\(\)[\s\S]{0,120}?id: E2E_ADMIN_USER_ID/)
assert.match(adminUsersE2e, /const INITIAL_USERS[\s\S]{0,160}?id: E2E_ADMIN_USER_ID/)
assert.match(adminUsersE2e, /const E2E_ADMIN_ACTOR_ID = E2E_ADMIN_USER_ID/)
assert.match(adminUsersE2e, /displayName: 'Aylin Yılmaz'/)
assert.match(adminUsersE2e, /matchesDisplayName/)
assert.match(adminUsersE2e, /displayName: user\.displayName\?\.trim\(\) \|\| user\.username/)

for (const exportedApi of [
  'fetchAdminUserPreview',
  'getAdminUserDetail',
  'getAdminUserDetailInsights',
  'getAdminUserOverview',
  'invalidateAdminUserDetailCache',
  'invalidateAdminUserInsightsCache',
  'listAdminUsersPage',
  'setAdminUserBanState',
  'setAdminUsersBanState',
  'updateAdminUserRole',
]) {
  assert.match(serviceExports, new RegExp(`\\b${exportedApi}\\b`), `${exportedApi} disari aktarilmali`)
}

const rpcSources = [queries, overview, mutations].join('\n')
for (const rpcName of [
  'get_admin_user_management_overview',
  'get_admin_user_overview_counts',
  'list_admin_user_management_page',
  'get_admin_user_management_preview',
  'set_admin_users_ban_state',
  'set_user_ban_state',
  'set_user_role',
]) {
  assert.match(
    rpcSources,
    new RegExp(`supabase\\.rpc\\('${rpcName}'`),
    `The client must use the public ${rpcName} RPC name`,
  )
}
assert.doesNotMatch(rpcSources, /supabase\.rpc\('app_private\./)

console.log('PASS admin user management UI and service contract kept')
