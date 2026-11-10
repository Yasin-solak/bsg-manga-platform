import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const featureFlagServicePath = path.join(repoRoot, 'src/services/featureFlagService.ts')
const publicUserDirectoryLitePath = path.join(repoRoot, 'src/services/publicUserDirectoryLite.ts')
const storeItemLiteDirectoryPath = path.join(repoRoot, 'src/services/storeItemLiteDirectory.ts')
const communityCosmeticSharedPath = path.join(repoRoot, 'src/services/communityCosmeticService/shared.ts')
const avatarFrameResolvedAssetsPath = path.join(repoRoot, 'src/components/common/AvatarFrame/useAvatarFrameResolvedAssets.ts')
const appSidebarDataPath = path.join(repoRoot, 'src/components/layout/appSidebar/useAppSidebarData.ts')
const footerPath = path.join(repoRoot, 'src/components/layout/Footer.tsx')
const contactPagePath = path.join(repoRoot, 'src/pages/ContactPage.tsx')
const siteSettingsPublicSnapshotPath = path.join(repoRoot, 'src/services/siteSettingsPublicSnapshot.ts')
const profileDataLoadersPath = path.join(repoRoot, 'src/pages/profile/profileDataLoaders.ts')
const mangaDetailsPath = path.join(repoRoot, 'src/services/mangaService/details.ts')

const featureFlagSource = fs.readFileSync(featureFlagServicePath, 'utf8')
const publicUserDirectoryLiteSource = fs.readFileSync(publicUserDirectoryLitePath, 'utf8')
const storeItemLiteDirectorySource = fs.readFileSync(storeItemLiteDirectoryPath, 'utf8')
const communityCosmeticSharedSource = fs.readFileSync(communityCosmeticSharedPath, 'utf8')
const avatarFrameResolvedAssetsSource = fs.readFileSync(avatarFrameResolvedAssetsPath, 'utf8')
const appSidebarDataSource = fs.readFileSync(appSidebarDataPath, 'utf8')
const footerSource = fs.readFileSync(footerPath, 'utf8')
const contactPageSource = fs.readFileSync(contactPagePath, 'utf8')
const siteSettingsPublicSnapshotSource = fs.readFileSync(siteSettingsPublicSnapshotPath, 'utf8')
const profileDataLoadersSource = fs.readFileSync(profileDataLoadersPath, 'utf8')
const mangaDetailsSource = fs.readFileSync(mangaDetailsPath, 'utf8')

assert.match(
  featureFlagSource,
  /rpc\('get_runtime_feature_flags'/,
  'Feature flag runtime okumalari toplu snapshot RPC uzerinden gecebilmelidir.',
)

assert.doesNotMatch(
  featureFlagSource,
  /Promise\.all\(uniqueKeys\.map\(\(key\) => isFeatureEnabled/,
  'Runtime flag okumalari key basina ayri RPC patlatmamali.',
)

assert.match(
  publicUserDirectoryLiteSource,
  /export async function loadPublicUserDirectoryLiteByIds/,
  'the public_user_directory short lookup layer must offer bulk reads by id.',
)

assert.match(
  publicUserDirectoryLiteSource,
  /export async function loadPublicUserDirectoryLiteByUsernames/,
  'the public_user_directory short lookup layer must offer bulk reads by username.',
)

assert.match(
  storeItemLiteDirectorySource,
  /export async function loadStoreItemsLiteByIdentifiers/,
  'the store_items short lookup layer must offer bulk reads by identifier.',
)

assert.match(
  storeItemLiteDirectorySource,
  /export async function loadStoreItemsLiteByRefs/,
  'the store_items short lookup layer must resolve mixed id and identifier references with one helper.',
)

assert.match(
  communityCosmeticSharedSource,
  /loadStoreItemsLiteByRefs/,
  'repeat community cosmetic lookups must go through the shared mixed store_items lite helper.',
)

assert.match(
  avatarFrameResolvedAssetsSource,
  /loadStoreItemsLiteByIdentifiers/,
  'repeat avatar frame lookups must go through the shared store_items lite helper.',
)

assert.match(
  avatarFrameResolvedAssetsSource,
  /const allowLiveFrameAsIdleFallback = hoverPlayback !== 'never'/,
  'the heavy live frame fallback must be controlled explicitly on hoverless surfaces.',
)

assert.doesNotMatch(
  avatarFrameResolvedAssetsSource,
  /const idleFrameImage = [^\n]+liveFrameImage/,
  'Idle frame fallback zinciri hoverPlayback=never iken canli overlay\'i kosulsuz kullanmamalidir.',
)

assert.match(
  appSidebarDataSource,
  /loadStoreItemsLiteByIdentifiers/,
  'Sidebar bakiye envanter lookuplari ortak store_items lite helper uzerinden gecmelidir.',
)

assert.match(
  siteSettingsPublicSnapshotSource,
  /export async function getSiteSettingsPublicContactSnapshot/,
  'the public site settings layer must offer a separate snapshot helper for contact data.',
)

assert.match(
  siteSettingsPublicSnapshotSource,
  /site_title,[\s\S]*site_description,[\s\S]*maintenance_mode,[\s\S]*registration_enabled,[\s\S]*discord_invite_url,[\s\S]*logo_url,[\s\S]*storefront_runtime_config,[\s\S]*store_home_config/,
  'the general public site settings snapshot must select only narrow public fields.',
)

assert.match(
  contactPageSource,
  /getSiteSettingsPublicContactSnapshot/,
  'the Contact page must use a separate public contact snapshot for contact_email.',
)

assert.match(
  footerSource,
  /getSiteSettingsPublicSnapshot/,
  'the Footer must use a narrow public snapshot for general site settings.',
)

assert.doesNotMatch(
  footerSource,
  /mailto:/,
  'the Footer must not carry contact_email in the public payload.',
)

assert.match(
  profileDataLoadersSource,
  /getActivityFeed\(profileId,\s*\{[\s\S]*recentHistory: historyResult\.status === 'fulfilled' \? history : null[\s\S]*\}\)/,
  'the profile collection loader must not requery reading history for the activity feed.',
)

assert.match(
  profileDataLoadersSource,
  /getUserStats\(profileId\)/,
  'the profile collection loader must hydrate profile stats via one snapshot RPC.',
)

assert.doesNotMatch(
  profileDataLoadersSource,
  /getUserFollowers\(profileId\)|getUserFollowing\(profileId\)/,
  'full follower and following lists must not be downloaded up front on profile open.',
)

assert.match(
  mangaDetailsSource,
  /from\('manga_follows'\)\s*\.select\('manga_id', \{ count: 'exact' \}\)\s*\.eq\('manga_id', data\.id\)\s*\.limit\(1\)/,
  'manga detail follower count must use one GET/count query instead of a needless HEAD probe.',
)
