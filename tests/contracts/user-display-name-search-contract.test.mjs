import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { untranslate } from './i18n-source.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return untranslate(readFileSync(path.join(rootDir, relativePath), 'utf8'))
}

const globalSearchSource = readSource('src/services/globalSearchService.ts')
const globalSearchCommandSource = readSource('src/components/layout/DesktopSearchCommand.tsx')
const shopGiftDialogSource = readSource('src/pages/shop/ShopPurchaseDialog.tsx')
const mentionSearchSource = readSource('src/services/communityMentionService/search.ts')
const autocompleteSource = readSource('src/hooks/useInlineAutocomplete.ts')
const mentionResolveSource = readSource('src/services/communityMentionService/resolve.ts')
const directoryLiteSource = readSource('src/services/publicUserDirectoryLite.ts')

assert.match(globalSearchSource, /select\('id, username, display_name, avatar_url'\)/)
assert.match(globalSearchSource, /username\.ilike\.\$\{userLike\},display_name\.ilike\.\$\{userLike\}/)
assert.match(globalSearchSource, /displayName: row\.display_name\?\.trim\(\) \|\| row\.username/)
assert.match(globalSearchSource, /href: `\/profil\/\$\{encodeURIComponent\(row\.username\)\}`/)
assert.match(globalSearchCommandSource, /\{item\.displayName\}[\s\S]*@\{item\.username\}/)
// Shop v3 gift recipient: display name + @username, through the shared global search.
assert.match(shopGiftDialogSource, /searchGlobalEntities\(query, 6, controller\.signal\)/)
assert.match(shopGiftDialogSource, /\{user\.displayName\}<\/span>\s*<span[^>]*>@\{user\.username\}/)

assert.match(mentionSearchSource, /select\('id, username, display_name, avatar_url'\)/)
assert.match(mentionSearchSource, /username\.ilike\.\$\{like\},display_name\.ilike\.\$\{like\}/)
assert.match(mentionSearchSource, /displayName: row\.display_name\?\.trim\(\) \|\| row\.username/)
assert.match(autocompleteSource, /label: user\.displayName\?\.trim\(\) \|\| user\.username/)
assert.match(autocompleteSource, /secondaryText: `Kullanıcı · @\$\{user\.username\}`/)
assert.match(autocompleteSource, /insertText: `@\$\{user\.username\}`/)

assert.equal(
  directoryLiteSource.match(/select\('id, username, display_name, avatar_url, frame_type, background_type, active_fansub_identity_tag, active_name_style'\)/g)?.length,
  2,
  'display name (and name style in comments) must be kept in ID and username based public directory reads.',
)
assert.match(mentionResolveSource, /displayName: row\.display_name\?\.trim\(\) \|\| row\.username/)

console.log('PASS display name search and mention contract kept')
