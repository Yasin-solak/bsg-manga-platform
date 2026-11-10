import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const hoverResolveSource = readFileSync(path.join(rootDir, 'src', 'services', 'hoverCardService', 'fansubHover.resolve.row.ts'), 'utf8')
const fansubCatalogSource = readFileSync(path.join(rootDir, 'src', 'services', 'fansubService', 'catalog.ts'), 'utf8')
const schemaCapabilitySource = readFileSync(path.join(rootDir, 'src', 'services', 'dbSchemaCapability.ts'), 'utf8')

assert.match(hoverResolveSource, /const QUERY_COLUMNS = 'id, slug, name, avatar_url, description, frame_type, primary_color, secondary_color, custom_background_asset_url, active_name_style, manga_count, follower_count, active_frame_id, active_background_id, active_pattern_id, active_profile_effect_id, hover_theme'/)
assert.match(hoverResolveSource, /const LEGACY_QUERY_COLUMNS = 'id, slug, name, avatar_url, description, frame_type, primary_color, secondary_color, custom_background_asset_url, active_name_style, manga_count, follower_count, active_frame_id, active_background_id, active_pattern_id'/)
assert.match(hoverResolveSource, /\.select\(columns\)/)
assert.match(fansubCatalogSource, /supabase\.rpc\('get_fansubs_with_stats'/)
assert.doesNotMatch(fansubCatalogSource, /select\('\*'\)/)
assert.match(fansubCatalogSource, /custom_background_asset_url/)
assert.match(schemaCapabilitySource, /FANSUB_ACTIVE_PROFILE_EFFECT_COLUMN_STORAGE_KEY/)
assert.match(schemaCapabilitySource, /readStoredColumnCapability/)
assert.match(schemaCapabilitySource, /writeStoredColumnCapability/)

console.log('PASS fansub schema compatibility fallback contract kept')
