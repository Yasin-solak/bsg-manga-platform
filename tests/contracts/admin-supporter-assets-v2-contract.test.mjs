import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { untranslate } from './i18n-source.mjs'

const read = (relativePath) => untranslate(readFileSync(path.resolve(process.cwd(), relativePath), 'utf8'))

const section = read('src/components/admin/sections/AdminSupporterAssetsSection.tsx')
const dialogs = read('src/components/admin/sections/supporterAssets/AdminSupporterAssetDrilldownDialogs.tsx')
const shared = read('src/components/admin/sections/supporterAssets/supporterAssetAdminShared.tsx')

// Emoji and stickers v2 (2026-11-03): tabs, removal, level confirmation, quota from the server.
for (const id of ['assets', 'fansubs', 'settings']) assert.match(section, new RegExp(`id: '${id}'`))
// Uygunsuz ifade admin tarafindan kaldirilabilir (arsiv, onayli).
assert.match(section, /archiveFansubSupporterAsset\(asset\.fansubId, asset\.assetId\)/)
assert.match(section, /kayıt denetim için arşivde tutulur/)
assert.match(dialogs, /data-testid="supporter-asset-archive"/)
// Seviye degisikligi etkisini soyleyen onaydan gecer.
assert.match(section, /const changeCapability = /)
assert.match(section, /getFansubBoostDowngradeRule\(row\.capabilityKey\)\.detail/)
// The quota table comes from server data, not fixed text (there used to be a handwritten "Core: emoji 5...").
assert.match(section, /dashboard\.tierQuotas\.map/)
assert.doesNotMatch(section, /Core: emoji 5/)
assert.match(shared, /\{ value: 'tier:1', label: 'Seviye 1' \}/)

console.log('PASS admin emoji and stickers v2 (removal, level confirm, server quota)')
