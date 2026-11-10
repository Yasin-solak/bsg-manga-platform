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

const migration = read('supabase/migrations/20260527235901_avatar_storage_owner_fallback.sql')
const profileEditHelpers = read('src/pages/profile/profileEditMutationHelpers.ts')
const uploadsService = read('src/services/storageService/uploads.ts')

const uploadPolicy = blockAfter(migration, 'create policy "Scoped upload avatars"')
assert.match(uploadPolicy, /bucket_id = 'avatars'/)
assert.match(uploadPolicy, /\(storage\.foldername\(name\)\)\[1\] = 'user-avatars'/)
assert.match(uploadPolicy, /owner = auth\.uid\(\)/, 'insert policy Storage owner bilgisini kabul etmeli')
assert.match(uploadPolicy, /\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/)
assert.match(uploadPolicy, /\(storage\.foldername\(name\)\)\[2\] = app_private\.current_public_user_id\(\)::text/)
assert.doesNotMatch(uploadPolicy, /from public\.users/i)

for (const policyName of ['Scoped update avatars', 'Scoped delete avatars']) {
  const policy = blockAfter(migration, `create policy "${policyName}"`)
  assert.match(policy, /owner = auth\.uid\(\)/, `${policyName} owner tabanli bakimi korumali`)
  assert.match(policy, /\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/)
  assert.match(policy, /\(storage\.foldername\(name\)\)\[2\] = app_private\.current_public_user_id\(\)::text/)
}

assert.match(
  profileEditHelpers,
  /const mediaStorageOwnerAuthUserId = storageOwnerAuthUserId \|\| ''[\s\S]+if \(\(avatarUploadFile \|\| backgroundUploadFile\) && !mediaStorageOwnerAuthUserId\)/,
  'profile media upload must not start without the auth owner id',
)
assert.match(
  profileEditHelpers,
  /uploadUserAvatar\(avatarUploadFile, mediaStorageOwnerAuthUserId \|\| userId\)/,
  'the avatar Storage path must be buildable with the auth owner id instead of the public profile id',
)
assert.match(
  uploadsService,
  /uploadPublicFile\('user_avatar', `user-avatars\/\$\{normalizedUserId\}`, normalizedFile\)/,
  'the storage service must keep writing the given owner segment under user-avatars',
)

console.log('PASS Supabase avatar storage owner fallback contract kept')
