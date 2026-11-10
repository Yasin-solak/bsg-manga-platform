import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function blockAfter(source, marker, endMarker = '\n\n') {
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `${marker} bulunamadi`)
  const end = source.indexOf(endMarker, start + marker.length)
  return source.slice(start, end === -1 ? undefined : end)
}

const migration = read('supabase/migrations/20260526235905_community_post_image_storage_private_helper.sql')
const uploadsService = read('src/services/storageService/uploads.ts')

assert.match(migration, /grant usage on schema app_private to authenticated, service_role;/)
assert.match(
  migration,
  /grant execute on function app_private\.can_write_pending_community_post_child\(uuid\) to authenticated, service_role;/,
)
assert.match(
  migration,
  /drop policy if exists "Community post image upload own posts" on storage\.objects;/,
)
assert.match(
  migration,
  /drop policy if exists "Community post image upload own pending posts" on storage\.objects;/,
)

const policy = blockAfter(migration, 'create policy "Community post image upload own pending posts"')
assert.match(policy, /bucket_id = 'store-assets'/)
assert.match(policy, /\(storage\.foldername\(name\)\)\[1\] = 'community'/)
assert.match(policy, /\(storage\.foldername\(name\)\)\[2\] = 'posts'/)
assert.match(policy, /\(storage\.foldername\(name\)\)\[4\].*\^slot-0\[1-4\]\$/s)
assert.match(
  policy,
  /app_private\.can_write_pending_community_post_child\(\(\(storage\.foldername\(name\)\)\[3\]\)::uuid\)/,
  'the community image policy must validate pending post ownership with an app_private helper',
)
assert.doesNotMatch(
  policy,
  /public\.can_write_pending_community_post_child\(/,
  'storage policy exposed public helper kullanmamali',
)

assert.match(uploadsService, /function buildCommunityPostImageFallbackPath\(postId: string, position: number\)/)
assert.match(
  uploadsService,
  /community\/posts\/\$\{normalizedPostId\}\/slot-\$\{String\(position\)\.padStart\(2, '0'\)\}/,
  'the frontend community fallback path must use the same segments as the policy',
)

console.log('PASS Supabase community post image storage private helper contract kept')
