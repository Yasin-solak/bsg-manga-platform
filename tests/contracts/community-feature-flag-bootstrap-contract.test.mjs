import assert from 'node:assert/strict'

// The old post feed (community_posts) was removed; merging the flag record with the admin
// operations screen and the seed migration are kept.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const adminOpsFeatureFlagSource = readSource('src/services/adminOpsService/featureFlags.ts')
const migrationPath = path.join(
  rootDir,
  'supabase/migrations/20260316235902_seed_community_rich_feature_flags.sql',
)

assert.equal(existsSync(migrationPath), true, 'community rich feature flag seed migration bulunamadi')

assert.match(adminOpsFeatureFlagSource, /listRegisteredFeatureFlags/)
assert.match(adminOpsFeatureFlagSource, /registryOnly/)
assert.match(adminOpsFeatureFlagSource, /mergeFeatureFlagsWithRegistry/)
assert.match(adminOpsFeatureFlagSource, /registry:/)

const migrationSource = readFileSync(migrationPath, 'utf8')
assert.match(migrationSource, /community\.rich_detail/)
assert.match(migrationSource, /community\.polls/)
assert.match(migrationSource, /community\.gifs/)
assert.match(migrationSource, /community\.emoji_reactions/)

console.log('PASS community feature flag bootstrap contract kept')
