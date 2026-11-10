import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const assetUrlServiceSource = read('src/services/assetUrlService.ts')
const publicImageProxySource = read('src/lib/publicImageProxyUrl.ts')
const optimizedPublicImageSource = read('src/lib/optimizedPublicImageUrl.ts')
const profileMediaSource = read('src/pages/profile/profileMedia.ts')
const patternStyleSource = read('src/services/patternStyleService.ts')
const profileEffectResolverSource = read('src/services/profileEffectAssetResolver.ts')
const avatarFrameResolverSource = read('src/components/common/AvatarFrame/useAvatarFrameResolvedAssets.ts')
const fansubManageSharedSource = read('src/services/fansubManageService/shared.ts')
const fansubManageChaptersSource = read('src/services/fansubManageService/chapters.ts')

assert.match(assetUrlServiceSource, /export function isSafeAssetUrl\(/)
assert.match(assetUrlServiceSource, /export function resolveSafeAssetUrl\(/)
assert.match(assetUrlServiceSource, /\^https\?:\\\/\\\//)
assert.match(assetUrlServiceSource, /\^data:\(\?:image\|video\)\\\//)
assert.match(assetUrlServiceSource, /shouldPreserveSupabaseStorefrontFallbackUrl/)
assert.match(assetUrlServiceSource, /path\.startsWith\('storefront\/'\)/)
assert.match(assetUrlServiceSource, /return url\.pathname\.startsWith\(`\/storage\/v1\/object\/public\/\$\{config\.bucket\}\/`\)/)
assert.match(assetUrlServiceSource, /return isSafeAssetUrl\(trimmed\) \? trimmed : undefined/)
assert.doesNotMatch(assetUrlServiceSource, /if \(isSafeAssetUrl\(trimmed\)\) return trimmed[\s\S]{0,80}return trimmed/)

assert.match(publicImageProxySource, /if \(!isAllowedProxySource\(trimmed\)\) return undefined/)
assert.doesNotMatch(publicImageProxySource, /if \(!isAllowedProxySource\(trimmed\)\) return trimmed/)

assert.match(optimizedPublicImageSource, /return isSafeDirectImageUrl\(trimmed\) \? trimmed : undefined/)
assert.doesNotMatch(profileMediaSource, /\|\| trimmed/)

assert.match(patternStyleSource, /resolveSafeAssetUrl/)
assert.match(profileEffectResolverSource, /resolveSafeAssetUrl/)
assert.match(avatarFrameResolverSource, /resolveSafeAssetUrl/)
assert.doesNotMatch(avatarFrameResolverSource, /resolveStoreAssetUrl/)

assert.match(fansubManageSharedSource, /\.map\(\(url\) => normalizeChapterPageRef\(url\) \|\| ''\)/)
assert.match(fansubManageChaptersSource, /\.map\(\(url\) => normalizeChapterPageRef\(url\)\?\.trim\(\) \|\| ''\)/)

console.log('PASS safe media URL contract kept')
