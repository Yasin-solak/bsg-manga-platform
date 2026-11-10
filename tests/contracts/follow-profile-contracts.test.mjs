import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const srcDir = path.join(rootDir, 'src')
const FOLLOW_TABLES = ['user_follows', 'manga_follows', 'fansub_follows']
const READ_MODEL_TABLES = ['reading_history', 'user_badges', 'notifications']
const FANSUB_REQUEST_TABLES = ['fansub_requests']
const MANGA_LIST_COMMENT_TABLES = ['user_manga_list_comments']

function readSource(relativePath) {
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

function extractQueryBlocks(source, tables, windowSize = 260) {
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
      blocks.push({
        table,
        block: source.slice(start, end),
      })
      searchStart = start + marker.length
    }
  }

  return blocks
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

run('no fake id column is selected on follow edge tables', () => {
  const offenders = []

  for (const filePath of listSourceFiles(srcDir)) {
    const source = readFileSync(filePath, 'utf8')
    const invalidBlocks = extractQueryBlocks(source, FOLLOW_TABLES)
      .filter(({ block }) => /\.select\(\s*['"`]id(?:['"`]|\s*,)/.test(block))
      .map(({ block }) => block.replace(/\s+/g, ' ').trim())

    if (invalidBlocks.length > 0) {
      offenders.push(`${path.relative(rootDir, filePath)} => ${invalidBlocks.join(' | ')}`)
    }
  }

  assert.deepEqual(offenders, [])
})

run('select(*) is not used for counts on follow edge tables', () => {
  const offenders = []

  for (const filePath of listSourceFiles(srcDir)) {
    const source = readFileSync(filePath, 'utf8')
    const invalidBlocks = extractQueryBlocks(source, FOLLOW_TABLES)
      .filter(({ block }) => /\.select\(\s*['"`]\*/.test(block))
      .map(({ block }) => block.replace(/\s+/g, ' ').trim())

    if (invalidBlocks.length > 0) {
      offenders.push(`${path.relative(rootDir, filePath)} => ${invalidBlocks.join(' | ')}`)
    }
  }

  assert.deepEqual(offenders, [])
})

run('select(*) does not leak into the read-model in reading_history user_badges notifications queries', () => {
  const offenders = []

  for (const filePath of listSourceFiles(srcDir)) {
    const source = readFileSync(filePath, 'utf8')
    const invalidBlocks = extractQueryBlocks(source, READ_MODEL_TABLES, 320)
      .filter(({ block }) => /\.select\(\s*['"`]\*/.test(block))
      .map(({ table, block }) => `${table}: ${block.replace(/\s+/g, ' ').trim()}`)

    if (invalidBlocks.length > 0) {
      offenders.push(`${path.relative(rootDir, filePath)} => ${invalidBlocks.join(' | ')}`)
    }
  }

  assert.deepEqual(offenders, [])
})

run('select(*) is not used in fansub request and manga list comment services', () => {
  const offenders = []

  for (const filePath of listSourceFiles(srcDir)) {
    const source = readFileSync(filePath, 'utf8')
    const invalidBlocks = [
      ...extractQueryBlocks(source, FANSUB_REQUEST_TABLES, 340),
      ...extractQueryBlocks(source, MANGA_LIST_COMMENT_TABLES, 320),
    ]
      .filter(({ block }) => /\.select\(\s*['"`]\*/.test(block))
      .map(({ table, block }) => `${table}: ${block.replace(/\s+/g, ' ').trim()}`)

    if (invalidBlocks.length > 0) {
      offenders.push(`${path.relative(rootDir, filePath)} => ${invalidBlocks.join(' | ')}`)
    }
  }

  assert.deepEqual(offenders, [])
})

run('profile follow services keep the activity and composite key contract', () => {
  const followsSource = readSource('src/services/userService/follows.ts')
  const activitySource = readSource('src/services/userService/activity.ts')
  const wrappedSource = readSource('src/services/wrappedService/summary.fetch.ts')
  const adminFallbackSource = readSource('src/services/adminUserDetailService/fallback.fetch.activity.ts')

  assert.match(followsSource, /const FOLLOWED_FANSUB_SELECT = `[\s\S]*user_id,[\s\S]*fansub_id,[\s\S]*created_at,/)
  assert.doesNotMatch(followsSource, /const FOLLOWED_FANSUB_SELECT = `\s*id,/)
  assert.match(followsSource, /\.eq\('fansub\.is_active', true\)/)
  assert.match(activitySource, /\.eq\('manga\.is_active', true\)/)
  assert.match(activitySource, /\.eq\('manga\.is_approved', true\)/)
  assert.match(wrappedSource, /\.from\('manga_follows'\)[\s\S]{0,120}?\.select\('manga_id', \{ count: 'exact', head: true \}\)/)
  assert.doesNotMatch(wrappedSource, /community_posts/)
  assert.ok(adminFallbackSource.includes("supabase.from('fansub_follows').select('user_id', { count: 'exact', head: true }).eq('user_id', userId)"))
})

run('admin and store read-model services keep the narrow query contract', () => {
  const dashboardSource = readSource('src/services/adminService/shared.dashboard.ts')
  const adminUserSource = readSource('src/services/adminUserService/queries.ts')
  const adminUserOverviewSource = readSource('src/services/adminUserService/overviewSnapshot.ts')
  const fansubHistorySource = readSource('src/services/adminService/fansubs.history.ts')
  const badgeCatalogSource = readSource('src/services/badgeService/catalog.ts')

  assert.match(dashboardSource, /supabase\.rpc\('get_admin_user_overview_counts'/)
  assert.match(dashboardSource, /supabase\.rpc\('get_admin_recent_users'/)
  assert.doesNotMatch(dashboardSource, /select\('\*', \{ count: 'exact', head: true \}\)/)
  assert.match(dashboardSource, /select\('id', \{ count: 'exact', head: true \}\)/)
  assert.doesNotMatch(adminUserSource, /select\('\*', \{ count: 'exact', head: true \}\)/)
  assert.match(adminUserSource, /getAdminUserOverviewSnapshot\(\)/)
  assert.match(adminUserOverviewSource, /supabase\.rpc\('get_admin_user_management_overview'\)/)
  assert.match(adminUserOverviewSource, /supabase\.rpc\('get_admin_user_overview_counts'\)/)
  assert.ok(
    adminUserOverviewSource.indexOf("supabase.rpc('get_admin_user_management_overview')")
      < adminUserOverviewSource.indexOf("supabase.rpc('get_admin_user_overview_counts')"),
    'the legacy overview RPC must be a fallback only if the new management overview RPC is not found',
  )
  assert.doesNotMatch(fansubHistorySource, /select\('\*', \{ count: 'exact', head: true \}\)/)
  assert.match(fansubHistorySource, /select\('id', \{ count: 'exact', head: true \}\)/)
  assert.match(badgeCatalogSource, /const BADGE_CATALOG_SELECT = `/)
  assert.doesNotMatch(badgeCatalogSource, /\.select\('\*'\)/)
  assert.match(badgeCatalogSource, /\.maybeSingle\(\)/)
})

run('badge history and notification services keep the narrow query contract', () => {
  const badgeSource = readSource('src/services/badgeService/userBadges.ts')
  const notificationSource = readSource('src/services/notificationService/notifications.ts')
  const adminFallbackSource = readSource('src/services/adminUserDetailService/fallback.fetch.activity.ts')
  const achievementSource = readSource('src/services/notificationService/achievements.ts')

  assert.match(badgeSource, /const USER_BADGE_SELECT = `/)
  assert.match(badgeSource, /const USER_BADGE_WRITEBACK_SELECT = 'id, user_id, badge_id, obtained_at, is_displayed, display_order'/)
  assert.doesNotMatch(badgeSource, /badge:badges\(\*\)/)
  assert.match(notificationSource, /const DEFAULT_NOTIFICATION_LIMIT = 30/)
  assert.match(notificationSource, /const MAX_NOTIFICATION_LIMIT = 100/)
  assert.match(notificationSource, /\.limit\(normalizeNotificationLimit\(options\?\.limit\)\)/)
  assert.match(notificationSource, /\.select\('id', \{ count: 'exact', head: true \}\)/)
  assert.match(notificationSource, /\.eq\('is_read', false\)/)
  assert.ok(adminFallbackSource.includes("supabase.from('reading_history').select('id', { count: 'exact', head: true }).eq('user_id', userId)"))
  assert.ok(adminFallbackSource.includes("supabase.from('user_badges').select('id', { count: 'exact', head: true }).eq('user_id', userId)"))
  assert.doesNotMatch(adminFallbackSource, /community_posts|community_comments/)
  assert.ok(adminFallbackSource.includes("supabase.from('manga_comments').select('id', { count: 'exact', head: true }).eq('user_id', userId)"))
  assert.match(achievementSource, /\.maybeSingle\(\)/)
})

run('profile data and partial error loaders keep the narrow select contract', () => {
  const profilesSource = readSource('src/services/userService/profiles.ts')
  const loaderSource = readSource('src/pages/profile/profileDataLoaders.ts')

  assert.match(profilesSource, /const PROFILE_IDENTITY_SELECT = `/)
  assert.match(profilesSource, /get_public_user_profile_by_id/)
  assert.match(profilesSource, /get_public_user_profile_by_username/)
  assert.match(profilesSource, /public_user_directory/)
  assert.doesNotMatch(profilesSource, /\.select\('\*'\)/)
  assert.doesNotMatch(profilesSource, /\bstats\b/)
  assert.match(profilesSource, /supabase\.rpc\(rpcName, payload\)/)
  assert.match(loaderSource, /Promise\.allSettled\(/)
  assert.match(loaderSource, /resolveSettledOrFallback/)
  assert.match(loaderSource, /loadProfileCollections/)
  assert.match(loaderSource, /loadProfileDecorations/)
})

run('fansub request and manga list comment services keep the narrow writeback contract', () => {
  const fansubRequestSource = readSource('src/services/fansubService/requests.ts')
  const mangaListCommentSource = readSource('src/services/mangaListService/comments.ts')

  assert.match(fansubRequestSource, /const FANSUB_REQUEST_SELECT = `/)
  assert.match(fansubRequestSource, /const PENDING_FANSUB_REQUEST_SELECT = `/)
  assert.doesNotMatch(fansubRequestSource, /\.select\('\*'\)/)
  assert.match(fansubRequestSource, /\.select\(FANSUB_REQUEST_SELECT\)/)
  assert.match(fansubRequestSource, /\.select\(PENDING_FANSUB_REQUEST_SELECT\)/)
  assert.match(mangaListCommentSource, /function buildMangaListCommentSelect\(\)/)
  assert.match(mangaListCommentSource, /isMangaListCommentSpoilerColumnUnavailable/)
  assert.doesNotMatch(mangaListCommentSource, /\.select\('\*'\)/)
  assert.match(mangaListCommentSource, /\.select\(buildMangaListCommentSelect\(\)\)/)
})


run('auth and manga comment writeback services keep the narrow select contract', () => {
  const authSource = readSource('src/services/authService/shared.ts')
  const mangaCommentSource = readSource('src/services/commentService/mutations.ts')

  assert.match(authSource, /supabase\.rpc\('get_auth_user_profile'/)
  assert.match(authSource, /supabase\.rpc\('get_my_session_guard_state'/)
  assert.doesNotMatch(authSource, /\.select\('\*'\)/)
  assert.doesNotMatch(authSource, /activeSessionId/)
  assert.match(mangaCommentSource, /function buildMangaCommentWritebackSelect\(\)/)
  assert.doesNotMatch(mangaCommentSource, /\.select\('\*'\)/)
  assert.match(mangaCommentSource, /\.select\(buildMangaCommentWritebackSelect\(\)\)/)
})



run('public cover and background optimizer pipeline keeps its contract', () => {
  const packageSource = readSource('package.json')
  const scriptSource = readSource('scripts/optimize-public-assets.mjs')
  const helperSource = readSource('src/lib/optimizedPublicImageUrl.ts')
  const manifestSource = readSource('src/generated/publicImageVariants.generated.ts')
  const sourceTargets = [
    { dir: path.join(rootDir, 'public', 'covers'), publicBase: '/covers', optimizedDir: path.join(rootDir, 'public', 'covers', 'optimized') },
    { dir: path.join(rootDir, 'public', 'backgrounds'), publicBase: '/backgrounds', optimizedDir: path.join(rootDir, 'public', 'backgrounds', 'optimized') },
  ]

  assert.match(packageSource, /"optimize:public-assets": "node scripts\/optimize-public-assets\.mjs"/)
  assert.match(packageSource, /"prebuild": "npm run optimize:public-assets"/)
  assert.match(scriptSource, /import sharp from 'sharp'/)
  assert.match(helperSource, /export function optimizePublicImageUrl/)
  assert.match(helperSource, /PUBLIC_IMAGE_VARIANT_MAP/)

  for (const target of sourceTargets) {
    const files = readdirSync(target.dir)
      .filter((name) => /\.(png|jpe?g)$/i.test(name))
      .sort((left, right) => left.localeCompare(right, 'tr'))

    for (const fileName of files) {
      const sourcePath = path.join(target.dir, fileName)
      const optimizedPath = path.join(target.optimizedDir, `${path.parse(fileName).name}.webp`)
      const publicPath = `${target.publicBase}/${fileName}`
      assert.ok(manifestSource.includes(JSON.stringify(publicPath)))
      assert.ok(statSync(optimizedPath).size < statSync(sourcePath).size)
    }
  }
})

run('critical cover and background surfaces use the optimized helper', () => {
  const criticalFiles = [
    'src/components/common/MangaCard.tsx',
    'src/components/common/MangaHoverCard.tsx',
    'src/pages/profile/ProfileIdentityCard.tsx',
    'src/pages/fansub/FansubIdentityCard.tsx',
  ]

  for (const relativePath of criticalFiles) {
    const source = readSource(relativePath)
    assert.match(source, /optimizePublicImageUrl/)
  }
})

run('home fansub fallback asset keeps its contract', () => {
  const homeMapperSource = readSource('src/services/homeService/shared.mappers.ts')
  const placeholderSource = readSource('src/lib/fansubAvatarPlaceholder.ts')
  const publicCloudAvatarPath = path.join(rootDir, 'public', 'fansub', 'cloud-avatar.png')

  assert.match(homeMapperSource, /buildFansubAvatarPlaceholder/)
  assert.match(placeholderSource, /export function buildFansubAvatarPlaceholder/)
  assert.doesNotMatch(homeMapperSource, /owl_avatar|fire_avatar|cloud_avatar|detective_avatar/)
  assert.ok(statSync(publicCloudAvatarPath).size < 700000)
})

run('the src assets folder holds only frame sources', () => {
  const srcAssetsDir = path.join(rootDir, 'src', 'assets')
  const removableTargets = [
    'background',
    'badges',
    'covers',
    'fansub',
    'icons',
    'latest_uploads_icon.png',
    'bsgmanga_logo.png',
  ]

  assert.ok(existsSync(path.join(srcAssetsDir, 'frames')))

  for (const entryName of removableTargets) {
    assert.equal(existsSync(path.join(srcAssetsDir, entryName)), false)
  }
})

run('home showcase and homepage feed keep the simplification contract', () => {
  const homeTrendingGridSource = readSource('src/components/home/HomeTrendingGrid.tsx')
  const homePageSource = readSource('src/pages/HomePage.tsx')
  const homeFeedSource = readSource('src/services/homeService/feed.ts')

  // Old showcase / updates / info cards / discussion components were deleted as unused (2026-11-03).
  for (const removed of ['HomeShowcase', 'HomeLatestUpdates', 'HomeInfoCards', 'DiscussionHighlightsSection']) {
    assert.equal(existsSync(path.join(rootDir, 'src/components/home', `${removed}.tsx`)), false, `${removed} geri gelmemeli`)
  }
  assert.doesNotMatch(homePageSource, /<HomeShowcase/)
  assert.doesNotMatch(homePageSource, /HomeLatestUpdates/)
  assert.doesNotMatch(homePageSource, /HomeInfoCards/)
  assert.match(homePageSource, /setHomeFansubs\(feed\.fansubs\.slice\(0, LIMITS\.fansubs\)\)/)
  assert.match(homePageSource, /homeFansubs\.length > 0 \? <HomeFansubSection/)
  assert.doesNotMatch(homePageSource, /DiscussionHighlightsSection/)
  assert.doesNotMatch(homePageSource, /getHomeDiscussionHighlights/)
  assert.doesNotMatch(homePageSource, /listPublicAnnouncements\(\{ limit: LIMITS\.announcements \}\),\s*listCommunityPosts\(\{ sort: 'popular'/)
  assert.match(homePageSource, /<HomeHero mangas=\{heroManga\.slice\(0, LIMITS\.hero\)\} loading=\{[^\n]+\} \/>/)
  assert.match(homePageSource, /<HomeContinueReading/)
  assert.match(homePageSource, /<HomeTrendingGrid mangas=\{trendingManga\} loading=\{feedLoading\} \/>/)
  assert.match(homePageSource, /<HomeNewChapters chapters=\{latestChapters\} loading=\{chaptersLoading\} \/>/)
  assert.doesNotMatch(homePageSource, /<ExploreThematicCollections/)
  assert.match(homePageSource, /getPublicExploreConfig/)
  assert.match(homePageSource, /navigate\(`\/kesfet\?\$\{params\.toString\(\)\}`\)/)
  assert.doesNotMatch(homePageSource, /<HomeCommunityCorner/)
  assert.match(homePageSource, /<HomeRightSidebar/)
  assert.match(homeTrendingGridSource, /TREND OLAN SERİLER/)
  assert.match(homeTrendingGridSource, /<DesktopPoster/)
  assert.doesNotMatch(homeTrendingGridSource, /En cok okunan mangalar|En çok okunan mangalar/)
  assert.match(homeFeedSource, /if \(safeLatestMangas\.length === 0\)/)
  assert.doesNotMatch(homeFeedSource, /communityHighlights|listCommunityPosts/)
})

run('avatarframe keeps the lazy import and visibility gating contract', () => {
  const avatarFrameSource = readSource('src/components/common/AvatarFrame/AvatarFrame.tsx')
  const avatarConstantsSource = readSource('src/components/common/AvatarFrame/avatarFrameConstants.ts')
  const avatarAssetsSource = readSource('src/components/common/AvatarFrame/useAvatarFrameResolvedAssets.ts')

  assert.match(avatarConstantsSource, /export type LazyFrameAsset = 'christmas' \| 'halloween' \| 'avatarframe1' \| 'avatarframe2' \| 'avatarframe3' \| 'avatarframe4'/)
  assert.ok(avatarConstantsSource.includes("christmas: () => import('../../../assets/frames/christmas-frame.png')"))
  assert.ok(avatarConstantsSource.includes("halloween: () => import('../../../assets/frames/halloween-frame.png')"))
  assert.doesNotMatch(avatarConstantsSource, /import christmasFrame/)
  assert.doesNotMatch(avatarConstantsSource, /import halloweenFrame/)
  assert.match(avatarAssetsSource, /const builtInFrameUrlCache = new Map<LazyFrameAsset, string>\(\)/)
  assert.match(avatarFrameSource, /rootMargin: '200px 0px'/)
  assert.match(avatarAssetsSource, /const cachedUrl = builtInFrameUrlCache.get\(loaderKey\)/)
  assert.match(avatarAssetsSource, /if \(!isVisible\) return/)
})

run('legacy premium keeps the archive contract', () => {
  const migrationSource = readSource('supabase/migrations/20260306235902_archive_legacy_premium_store_items.sql')

  assert.match(migrationSource, /update public\.store_items si/)
  assert.match(migrationSource, /si\.id <> cfg\.premium_store_item_id/)
})
run('premium runtime keeps the chapter access contract', () => {
  const migrationSource = readSource('supabase/migrations/20260306235901_premium_runtime_and_public_unlock.sql')
  const hardeningSource = readSource('supabase/migrations/20260608235901_premium_entitlement_only_hardening.sql')
  const publicServiceSource = readSource('src/services/premiumPackagePublicService.ts')
  const premiumSettingsMigration = readSource('supabase/migrations/20260930181000_shop_v3_premium_settings.sql')
  const premiumPerksMigration = readSource('supabase/migrations/20261001140000_premium_perks.sql')
  const premiumPerksPanel = readSource('src/components/admin/shop/ShopAdminPremiumPerks.tsx')

  assert.match(migrationSource, /create table if not exists public\.premium_runtime_config/)
  assert.match(hardeningSource, /create table if not exists public\.store_purchase_requests/)
  assert.match(hardeningSource, /create or replace function public\.get_active_premium_offer\(\)/)
  assert.match(hardeningSource, /create or replace function app_private\.can_current_user_access_chapter\(p_publish_at timestamptz\)/)
  assert.match(hardeningSource, /when p_publish_at > now\(\) then false/)
  assert.match(hardeningSource, /public_unlock_delay_hours = 36/)
  assert.match(hardeningSource, /create or replace function public\.purchase_store_item\(p_item_id uuid, p_request_key uuid\)/)
  assert.match(hardeningSource, /revoke execute on function public\.purchase_store_item\(uuid\) from anon, authenticated, public/)
  assert.doesNotMatch(hardeningSource, /'premium_reward'/)
  assert.doesNotMatch(hardeningSource, /'premium_compensation_coins'/)
  assert.match(publicServiceSource, /export type ActivePremiumOffer = \{/) 
  assert.match(publicServiceSource, /publicUnlockDelayHours: number/)
  assert.doesNotMatch(publicServiceSource, /randomRewardPoolTypes/)
  assert.doesNotMatch(publicServiceSource, /compensationCoins/)
  assert.doesNotMatch(publicServiceSource, /premiumBadge/)
  assert.doesNotMatch(publicServiceSource, /ActivePremiumPackage/)
  // Early access time moved from old shop management to Shop Control; it now turns on/off in the Premium tab
  // as the "Early access" perk and its time is given in the same place.
  assert.match(premiumSettingsMigration, /perform app_private\.shop_assert_admin\(\)/)
  assert.match(premiumSettingsMigration, /p_unlock_delay_hours not between 0 and 168/)
  assert.match(premiumPerksMigration, /if p_key = 'early_access' then\s+update public\.premium_runtime_config set\s+public_unlock_delay_hours = v_value/)
  assert.match(premiumPerksMigration, /if not app_private\.premium_perk_enabled\('early_access'\) then\s+return p_publish_at;/)
  assert.match(premiumPerksPanel, /shopAdmin\.savePremiumPerk\(meta\.key, nextEnabled/)
})

run('chapter public unlock client sources use the shared cutoff helper', () => {
  const helperBoundFiles = [
    'src/services/homeService/shared.chapters.ts',
    'src/services/mangaService/discovery.latest.ts',
    'src/services/fansubService/catalog.ts',
    'src/services/fansubService/management.ts',
    'src/services/mangaMetaService.ts',
  ]
  const detailsSource = readSource('src/services/mangaService/details.ts')

  for (const relativePath of helperBoundFiles) {
    const source = readSource(relativePath)
    assert.match(source, /getPublicChapterUnlockCutoffIso/)
    assert.match(source, /\.lte\('publish_at', nowIso\)/)
  }

  assert.doesNotMatch(detailsSource, /\.lte\('publish_at'/)
})

run('the premium chip shows separately from the badge limit on hover and profile', () => {
  const hoverCardSource = readSource('src/components/common/UserHoverCard.tsx')
  const hoverTypesSource = readSource('src/services/hoverCardService/types.ts')
  const profilePageSource = readSource('src/pages/ProfilePage.tsx')
  const profileControllerSource = readSource('src/pages/profile/useProfilePageController.ts')
  const profileLoaderSource = readSource('src/pages/profile/profilePageLoader.ts')
  const profileIdentitySource = readSource('src/pages/profile/ProfileIdentityCard.tsx')

  assert.match(hoverCardSource, /resolvedIsPremiumActive/)
  assert.match(hoverCardSource, /Premium/)
  assert.match(hoverTypesSource, /isPremiumActive: boolean/)
  assert.ok(
    /isPremiumActive: isPremiumActive\(premiumExpiresAt\)/.test(profilePageSource)
      || /isPremiumActive: isPremiumActive\(premiumExpiresAt\)/.test(profileControllerSource)
      || /isPremiumActive: isPremiumActive\(premiumExpiresAt\)/.test(profileLoaderSource),
  )
  assert.match(profileIdentitySource, /user\.isPremiumActive/)
})

run('store e2e premium mock keeps the timed entitlement contract', () => {
  const mockSource = readSource('src/testing/e2eMocks.ts')
  const authContextSource = readSource('src/contexts/AuthContext.tsx')

  assert.match(mockSource, /__BSGMANGA_E2E_RUNTIME__/) 
  assert.match(mockSource, /setE2ERuntimeCurrentUser/)
  assert.match(authContextSource, /setE2ERuntimeCurrentUser/) 
  assert.match(authContextSource, /premiumExpiresAt: currentUser\.premiumExpiresAt \?\? null/)
})
run('cosmetic poster keeps the public catalog contract', () => {
  const dataSource = readSource('src/data/storeProducts.ts')
  const sharedSource = readSource('src/services/storeService/shared.ts')
  const typesSource = readSource('src/services/storeService/types.ts')
  const catalogSource = readSource('src/services/storeService/catalog.ts')
  const uploadSource = readSource('src/services/storageService/uploads.ts')
  const frameUrlsSource = readSource('src/components/cosmetics/frameVisualUrls.ts')
  const migrationSource = readSource('supabase/migrations/20260307235901_store_item_poster_assets_and_store_catalog_focus.sql')

  assert.match(dataSource, /posterAssetUrl\?: string/)
  assert.match(dataSource, /PublicStoreItemType = 'frame' \| 'premium' \| 'background' \| 'profile_effect'/)
  assert.doesNotMatch(dataSource, /\{ id: 'badge', name: 'Rozet'/)
  assert.doesNotMatch(dataSource, /\{ id: 'pattern', name: 'Pattern'/)
  assert.match(typesSource, /poster_asset_url: string \| null/)
  assert.match(sharedSource, /posterAssetUrl: resolveStoreAssetUrl\(row\.poster_asset_url\)/)
  assert.match(catalogSource, /poster_asset_url/)
  assert.match(uploadSource, /productVariant: 'live' \\| 'poster' = 'live'/)
  assert.match(uploadSource, /productVariant === 'poster'/)
  assert.match(uploadSource, /productType !== 'frame' && productType !== 'background'/)
  assert.match(uploadSource, /const finalFile = await autoConvertToWebP\(file, 'poster'\)/)
  assert.match(uploadSource, /profile_effect.*folder/)
  assert.match(frameUrlsSource, /resolveStoreAssetUrl\(item\.posterAssetUrl\) \|\| item\.posterAssetUrl/)
  assert.match(migrationSource, /add column if not exists poster_asset_url text/)
})

run('the frame live preview replays on each hover entry', () => {
  const frameVisualsSource = readSource('src/components/cosmetics/FrameVisuals.tsx')
  const frameCardSource = readSource('src/pages/profile/ProfileEditFrameCard.tsx')

  assert.match(frameVisualsSource, /key=\{`live-frame-\$\{item\.id\}-\$\{playSession\}`\}/)
  assert.match(frameCardSource, /const \[playSession, setPlaySession\] = useState\(0\)/)
  assert.match(frameCardSource, /setPlaySession\(\((?:prev|current)\) => (?:prev|current) \+ 1\)/)
  assert.match(frameCardSource, /playSession=\{playSession\}/)
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}




















