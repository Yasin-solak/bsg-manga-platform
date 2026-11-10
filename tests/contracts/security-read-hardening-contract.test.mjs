import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const srcDir = path.join(rootDir, 'src')
const USERS_TABLE = ['users']
const SENSITIVE_USER_COLUMNS = ['owned_items', 'stones', 'active_session_id']
// The old shop sales detail (owner list) is gone; no exception file reads sensitive columns.
const ALLOWED_SENSITIVE_USER_QUERY_FILES = new Set([])
const PUBLIC_USER_PROJECTION_FILES = [
  'src/services/communityCosmeticService/userCosmetics.ts',
  'src/services/communityCosmeticService/postCosmetics.ts',
  'src/services/mangaListService/shared.comments.ts',
  'src/services/communityMentionService/search.ts',
  'src/services/communityMentionService/resolve.ts',
]
const SELF_IDENTITY_BARRIER_FILES = [
  'src/services/commentService/shared.ts',
  'src/services/commentService/mutations.ts',
  'src/services/mangaListService/shared.auth.ts',
  'src/services/mangaListService/comments.ts',
  'src/services/userService/privacy.ts',
  'src/services/userService/blocks.ts',
  'src/services/announcementService/shared.ts',
  'src/services/legalRequestService/shared.ts',
  'src/services/legalRequestService/moderation.ts',
  'src/services/reportService/actions.ts',
]
const TARGET_AND_LOOKUP_HARDENING_FILES = [
  'src/services/reportService/shared.ts',
  'src/services/reportService/targets.ts',
  'src/services/fansubMembershipService/invites.ts',
]
const ADMIN_USER_DIRECTORY_RPC_FILES = [
  'src/services/adminCommentModerationService/queries.ts',
  'src/services/redeemCodeService/adminUsage.ts',
]
const ADMIN_USER_SEARCH_RPC_FILES = [
  'src/services/adminService/shared.queries.search.ts',
  'src/services/adminMangaListService/queries.ts',
]
const SELF_AND_ADMIN_SUMMARY_RPC_FILES = [
  'src/services/userService/profiles.ts',
  'src/components/layout/appSidebar/useAppSidebarData.ts',
  'src/services/userService/onboarding.ts',
  'src/services/rewardService/fansubRewards.ts',
  'src/services/adminService/shared.dashboard.ts',
  'src/services/adminUserService/overviewSnapshot.ts',
]

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function listSourceFiles(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      return listSourceFiles(fullPath)
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

function extractQueryBlocks(source, tables, windowSize = 360) {
  const blocks = []

  for (const table of tables) {
    let searchStart = 0
    const marker = `.from('${table}')`
    while (true) {
      const start = source.indexOf(marker, searchStart)
      if (start === -1) break
      const nextFrom = source.indexOf(".from('", start + marker.length)
      const fallbackEnd = start + windowSize
      const end = nextFrom === -1 ? fallbackEnd : Math.min(nextFrom, fallbackEnd)
      blocks.push(source.slice(start, end))
      searchStart = start + marker.length
    }
  }

  return blocks
}

function extractSelectPayloads(block) {
  const payloads = []
  const regex = /\.select\(\s*(['"`])([\s\S]*?)\1/g
  let match

  while ((match = regex.exec(block)) !== null) {
    payloads.push(match[2])
  }

  return payloads
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

run('public users queries do not select sensitive columns', () => {
  const offenders = []

  for (const filePath of listSourceFiles(srcDir)) {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/')
    if (ALLOWED_SENSITIVE_USER_QUERY_FILES.has(relativePath)) continue

    const source = readFileSync(filePath, 'utf8')
    const invalidBlocks = extractQueryBlocks(source, USERS_TABLE)
      .filter((block) => {
        const selectPayloads = extractSelectPayloads(block)
        if (selectPayloads.length === 0) return false
        return selectPayloads.some((payload) =>
          SENSITIVE_USER_COLUMNS.some((column) => payload.includes(column)),
        )
      })
      .map((block) => block.replace(/\s+/g, ' ').trim())

    if (invalidBlocks.length > 0) {
      offenders.push(`${relativePath} => ${invalidBlocks.join(' | ')}`)
    }
  }

  assert.deepEqual(offenders, [])
})

run('the profile service public read model uses a narrow view and privacy-aware rpc', () => {
  const source = read('src/services/userService/profiles.ts')
  assert.match(source, /async function loadPublicProfileByRpc/)
  assert.match(source, /'get_public_user_profile_by_id'/)
  assert.match(source, /'get_public_user_profile_by_username'/)
  assert.match(source, /loadPublicProfileByRpc\('id', userId, options\.includeSocialLinks === true\)/)
  assert.match(source, /loadPublicProfileByRpc\('username', username, options\.includeSocialLinks === true\)/)
  assert.match(source, /from\('public_user_directory'\)/)
  assert.match(source, /'id' \| 'username' \| 'display_name' \| 'avatar_url' \| 'frame_type'/)
  assert.doesNotMatch(source, /PUBLIC_USER_PROFILE_BASE_SELECT/)
  assert.doesNotMatch(source, /PUBLIC_USER_PROFILE_WITH_SOCIAL_LINKS_SELECT/)
  assert.match(source, /export async function getProfileIdentityByIdentifier/)
})

run('public user batch read surfaces use public_user_directory', () => {
  for (const relativePath of PUBLIC_USER_PROJECTION_FILES) {
    const source = read(relativePath)
    assert.doesNotMatch(source, /\.from\('users'\)/, `${relativePath} hala users tablosuna gidiyor`)
    assert.match(
      source,
      /\.from\('public_user_directory'\)|loadPublicUserDirectoryLiteByIds|loadPublicUserDirectoryLiteByUsernames/,
      `${relativePath} does not use the public user projection helper`,
    )
  }

  const hoverSource = read('src/services/hoverCardService/userHover.resolve.ts')
  const commentSharedSource = read('src/services/commentService/shared.ts')
  assert.match(hoverSource, /\.from\('public_user_directory'\)/)
  assert.match(hoverSource, /supabase\.rpc\('get_public_user_profile_by_id'/)
  assert.match(
    commentSharedSource,
    /loadPublicUserDirectoryLiteByIds|\.from\('public_user_directory'\)\s*\.select\('id, username, avatar_url, frame_type, background_type'\)/,
  )
})

run('the profile page hydrates with the identity summary first, then the visibility decision', () => {
  const source = read('src/pages/profile/profilePageLoader.ts')

  assert.match(source, /const profileIdentity = await userService\.getProfileIdentityByIdentifier\(username\)/)
  assert.match(source, /const access = await userService\.getProfileViewAccess\(profileIdentity\.id\)/)
  assert.match(source, /await userService\.getProfileById\(profileIdentity\.id, \{ includeSocialLinks: canViewSocialLinks \}\)/)
  assert.doesNotMatch(source, /await userService\.getProfileByIdentifier\(username\)/)
})

run('profile mutations and quick equip flows use the safe customization RPC', () => {
  const profileMutationSource = read('src/pages/profile/profileEditMutationHelpers.ts')
  const sidebarSource = read('src/components/layout/appSidebar/useAppSidebarData.ts')

  assert.match(profileMutationSource, /userService\.updateMyProfileCustomization\(\{/)
  assert.doesNotMatch(profileMutationSource, /\.update\(\s*\{[\s\S]*owned_items/)
  assert.match(sidebarSource, /userService\.updateMyProfileCustomization\(\{/)
  assert.doesNotMatch(sidebarSource, /\.from\('users'\)\.update\(/)
})

run('the public fansub read model does not select coin_balance or a wildcard', () => {
  const catalogSource = read('src/services/fansubService/catalog.ts')
  const hoverSource = read('src/services/hoverCardService/fansubHover.resolve.row.ts')
  const migrationSource = read('supabase/migrations/20260321235904_fansub_public_economy_hardening.sql')

  assert.doesNotMatch(catalogSource, /coin_balance/)
  assert.doesNotMatch(catalogSource, /select\('\*'\)/)
  assert.doesNotMatch(hoverSource, /QUERY_COLUMNS = '\*'/)
  assert.doesNotMatch(hoverSource, /coin_balance/)
  assert.doesNotMatch(migrationSource, /coin_balance/)
  assert.match(migrationSource, /fansub_inventory_select_public/)
  assert.match(migrationSource, /fansub_transactions_select_public/)
})

run('the public community cosmetic carries no user owned_items fallback', () => {
  const postCosmeticsSource = read('src/services/communityCosmeticService/postCosmetics.ts')
  const sharedSource = read('src/services/communityCosmeticService/shared.ts')
  const typesSource = read('src/services/communityCosmeticService/types.ts')

  assert.doesNotMatch(postCosmeticsSource, /owned_items/)
  assert.doesNotMatch(sharedSource, /pickFirstOwnedRef/)
  assert.doesNotMatch(typesSource, /owned_items/)
})

run('sensitive self and admin user reads use the rpc barrier', () => {
  const authSource = read('src/services/authService/shared.ts')
  const profileSource = read('src/services/userService/profiles.ts')
  const adminFallbackSource = read('src/services/adminUserDetailService/fallback.fetch.profile.ts')
  const migrationSource = read('supabase/migrations/20260321235905_sensitive_user_column_projection_hardening.sql')

  assert.match(authSource, /supabase\.rpc\('get_auth_user_profile'/)
  assert.doesNotMatch(authSource, /AUTH_USER_SELECT/)
  assert.match(profileSource, /supabase\.rpc\('get_auth_user_profile'/)
  assert.match(profileSource, /supabase\.rpc\('get_my_private_user_profile'/)
  assert.match(adminFallbackSource, /supabase\.rpc\('get_admin_user_detail_profile'/)
  assert.match(migrationSource, /revoke select \(stones, owned_items, active_session_id, active_session_claimed_at\)/)
})

run('the public user projection migration sets the view and privacy-aware rpc', () => {
  const migrationSource = read('supabase/migrations/20260321235906_public_user_read_projection_hardening.sql')
  const commentTypesSource = read('src/services/commentService/types.ts')
  const mangaListTypesSource = read('src/services/mangaListService/shared.types.ts')

  assert.match(migrationSource, /create or replace view public\.public_user_directory as/)
  assert.match(migrationSource, /grant select on public\.public_user_directory to anon, authenticated;/)
  assert.match(migrationSource, /create or replace function public\.get_public_user_profile_by_id/)
  assert.match(migrationSource, /create or replace function public\.get_public_user_profile_by_username/)
  assert.match(migrationSource, /from public\.get_profile_view_access\(v_row\.id\)/)
  assert.match(migrationSource, /if coalesce\(v_access\.profile_visible, false\) = false then/)

  assert.doesNotMatch(commentTypesSource, /owned_items/)
  assert.doesNotMatch(mangaListTypesSource, /owned_items/)
})

run('live audit sertlestirme migrationi public premium alanini public profil projectionindan cikarir', () => {
  const migrationSource = read('supabase/migrations/20260328235901_live_audit_security_and_fansubs_hardening.sql')

  assert.match(migrationSource, /create or replace function public\.get_public_user_profile_by_id/)
  assert.match(migrationSource, /create or replace function public\.get_public_user_profile_by_username/)
  assert.doesNotMatch(migrationSource, /'premium_expires_at'/)
})

run('authenticated self resolver surfaces use the shared self identity barrier', () => {
  const selfIdentitySource = read('src/services/userService/selfIdentity.ts')
  const migrationSource = read('supabase/migrations/20260321235907_self_identity_projection_barrier.sql')

  assert.match(selfIdentitySource, /supabase\.rpc\('get_my_user_identity'/)
  assert.match(migrationSource, /create or replace function public\.get_my_user_identity\(\)/)
  assert.match(migrationSource, /grant execute on function public\.get_my_user_identity\(\) to authenticated;/)

  for (const relativePath of SELF_IDENTITY_BARRIER_FILES) {
    const source = read(relativePath)
    assert.match(source, /getCurrentUserIdentity/, `${relativePath} ortak self identity helper kullanmiyor`)
    assert.doesNotMatch(source, /\.eq\('auth_user_id',/, `${relativePath} hala auth_user_id uzerinden users lookup yapiyor`)
  }
})

run('remaining target lookup and invite surfaces use a narrow projection instead of the raw users table', () => {
  for (const relativePath of TARGET_AND_LOOKUP_HARDENING_FILES) {
    const source = read(relativePath)
    assert.doesNotMatch(source, /\.from\('users'\)/, `${relativePath} hala users tablosuna gidiyor`)
  }

  const reportSharedSource = read('src/services/reportService/shared.ts')
  const reportTargetsSource = read('src/services/reportService/targets.ts')
  const invitesSource = read('src/services/fansubMembershipService/invites.ts')

  assert.match(reportSharedSource, /\.from\('public_user_directory'\)/)
  assert.match(reportTargetsSource, /getAdminReportUserTarget/)
  assert.match(invitesSource, /\.from\('public_user_directory'\)/)
})

run('admin mini lookup and search surfaces use the purpose-built rpc barrier', () => {
  const helperSource = read('src/services/userService/adminDirectory.ts')
  const migrationSource = read('supabase/migrations/20260321235908_admin_and_target_lookup_projection_hardening.sql')

  assert.match(helperSource, /rpc\('get_admin_user_directory_by_ids'/)
  assert.match(helperSource, /rpc\('find_admin_user_ids_by_username'/)
  assert.match(helperSource, /rpc\('get_admin_report_user_target'/)

  for (const relativePath of ADMIN_USER_DIRECTORY_RPC_FILES) {
    const source = read(relativePath)
    assert.match(source, /listAdminUserDirectoryByIds/, `${relativePath} admin user directory helper kullanmiyor`)
    assert.doesNotMatch(source, /\.from\('users'\)/, `${relativePath} hala users tablosuna gidiyor`)
  }

  for (const relativePath of ADMIN_USER_SEARCH_RPC_FILES) {
    const source = read(relativePath)
    assert.match(source, /findAdminUserIdsByUsername|findUserIdsByUsernameSearch/, `${relativePath} beklenen arama helperini kullanmiyor`)
    assert.doesNotMatch(source, /\.from\('users'\)/, `${relativePath} hala users tablosuna gidiyor`)
  }

  assert.match(migrationSource, /create or replace function public\.get_admin_user_directory_by_ids/)
  assert.match(migrationSource, /create or replace function public\.find_admin_user_ids_by_username/)
  assert.match(migrationSource, /create or replace function public\.get_admin_report_user_target/)
})

run('self snapshot and narrow admin summary surfaces use the purpose-built rpc barrier', () => {
  const migrationSource = read('supabase/migrations/20260321235909_self_snapshot_and_admin_summary_hardening.sql')
  const profilesSource = read('src/services/userService/profiles.ts')
  const sidebarSource = read('src/components/layout/appSidebar/useAppSidebarData.ts')
  const onboardingSource = read('src/services/userService/onboarding.ts')
  const rewardRunsSource = read('src/services/rewardService/fansubRewards.ts')
  const dashboardSource = read('src/services/adminService/shared.dashboard.ts')
  const adminOverviewSource = read('src/services/adminUserService/overviewSnapshot.ts')

  assert.match(migrationSource, /create or replace function public\.get_my_profile_customization_snapshot\(\)/)
  assert.match(migrationSource, /create or replace function public\.mark_my_onboarding_completed\(/)
  assert.match(migrationSource, /create or replace function public\.get_admin_user_overview_counts\(\)/)
  assert.match(migrationSource, /create or replace function public\.get_admin_recent_users\(/)
  assert.match(migrationSource, /create or replace function public\.get_admin_store_item_user_owners\(/)

  assert.match(profilesSource, /supabase\.rpc\('get_my_profile_customization_snapshot'/)
  assert.match(sidebarSource, /getMyProfileCustomizationSnapshot/)
  assert.doesNotMatch(sidebarSource, /\.from\('users'\)/)

  assert.match(onboardingSource, /supabase\.rpc\('mark_my_onboarding_completed'/)
  assert.doesNotMatch(onboardingSource, /\.from\('users'\)/)

  assert.match(rewardRunsSource, /listAdminUserDirectoryByIds/)
  assert.doesNotMatch(rewardRunsSource, /\.from\('users'\)/)

  assert.match(dashboardSource, /supabase\.rpc\('get_admin_user_overview_counts'/)
  assert.match(dashboardSource, /supabase\.rpc\('get_admin_recent_users'/)
  assert.doesNotMatch(dashboardSource, /DASHBOARD_USER_LIST_SELECT/)

  assert.match(adminOverviewSource, /supabase\.rpc\('get_admin_user_management_overview'/)
  assert.match(adminOverviewSource, /supabase\.rpc\('get_admin_user_overview_counts'/)
  assert.ok(
    adminOverviewSource.indexOf("supabase.rpc('get_admin_user_management_overview')")
      < adminOverviewSource.indexOf("supabase.rpc('get_admin_user_overview_counts')"),
    'the legacy admin overview must be a fallback only if the new management RPC is not found',
  )

  for (const relativePath of SELF_AND_ADMIN_SUMMARY_RPC_FILES) {
    const source = read(relativePath)
    assert.ok(source.length > 0, `${relativePath} okunamadi`)
  }
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
