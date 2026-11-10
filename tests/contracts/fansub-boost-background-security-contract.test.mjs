import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const migrationSource = read('supabase/migrations/20260331235905_fansub_boost_background_capability_enforcement.sql')
const workerSource = read('functions/_shared/storage-upload-r2.js')
const uploadsSource = read('src/services/storageService/uploads.ts')

assert.match(migrationSource, /create or replace function public\.resolve_store_asset_media_kind/)
assert.match(migrationSource, /create or replace function public\.cleanup_invalid_fansub_custom_background/)
assert.match(migrationSource, /perform public\.cleanup_invalid_fansub_custom_background\(p_fansub_id, v_capabilities\)/)
assert.match(migrationSource, /create or replace function public\.maybe_refresh_fansub_boost_snapshot/)
assert.match(migrationSource, /create or replace function public\.assert_fansub_custom_background_access/)
assert.match(migrationSource, /create or replace function public\.guard_fansub_custom_background_capabilities/)
assert.match(migrationSource, /create trigger trg_fansub_custom_background_capabilities/)
assert.match(migrationSource, /volatile\s+security definer[\s\S]*maybe_refresh_fansub_boost_snapshot\(p_fansub_id\)/)
assert.match(migrationSource, /'Fansub arka plani yuklemek icin en az Seviye 1 boost gerekir\.'/)
assert.match(migrationSource, /'Video fansub arka plani icin en az Seviye 2 boost gerekir\.'/)

assert.match(workerSource, /async function requireFansubBoostBackgroundUploadAccess\(/)
assert.match(workerSource, /rpc\('get_public_fansub_boost_snapshot'/)
assert.match(workerSource, /await requireFansubBoostBackgroundUploadAccess\(authContext, fansubId, file\)/)

assert.match(uploadsSource, /throwFriendlyFansubProfileBackgroundUploadError/)
assert.match(uploadsSource, /Video fansub arka plani icin en az Seviye 2 boost gerekir\./)
assert.match(uploadsSource, /Fansub arka plani yuklemek icin en az Seviye 1 boost gerekir\./)

console.log('PASS fansub boost background capability gate contract kept')
