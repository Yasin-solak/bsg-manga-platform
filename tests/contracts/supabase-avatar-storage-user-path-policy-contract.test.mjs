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

const migration = read('supabase/migrations/20260526235904_avatar_storage_user_path_policy.sql')
const uploadsService = read('src/services/storageService/uploads.ts')

for (const policyName of [
  'Scoped upload avatars',
  'Scoped update avatars',
  'Scoped delete avatars',
]) {
  assert.match(
    migration,
    new RegExp(`drop policy if exists "${policyName}" on storage\\.objects;`),
    `${policyName} once temizlenmeli`,
  )
  assert.match(
    migration,
    new RegExp(`create policy "${policyName}"[\\s\\S]*on storage\\.objects`),
    `${policyName} must be recreated`,
  )
}

assert.match(migration, /grant usage on schema app_private to authenticated, service_role;/)
assert.match(migration, /grant execute on function app_private\.current_public_user_id\(\) to authenticated, service_role;/)
assert.match(migration, /grant execute on function app_private\.is_fansub_staff\(uuid\) to authenticated, service_role;/)

const uploadPolicy = blockAfter(migration, 'create policy "Scoped upload avatars"')
assert.match(uploadPolicy, /bucket_id = 'avatars'/)
assert.match(uploadPolicy, /\(storage\.foldername\(name\)\)\[1\] = 'user-avatars'/)
assert.match(
  uploadPolicy,
  /\(storage\.foldername\(name\)\)\[2\] = app_private\.current_public_user_id\(\)::text/,
  'the user avatar path must match the active public user id helper',
)
assert.doesNotMatch(
  uploadPolicy,
  /from public\.users/i,
  'storage policy public.users tablosunu dogrudan okumamali',
)
assert.doesNotMatch(
  uploadPolicy,
  /public\.is_(admin|fansub_staff|fansub_admin|current_public_user_id)\(/i,
  'the new storage policy must not use an exposed public helper',
)

const updatePolicy = blockAfter(migration, 'create policy "Scoped update avatars"')
const deletePolicy = blockAfter(migration, 'create policy "Scoped delete avatars"')

for (const [label, policy] of [
  ['update', updatePolicy],
  ['delete', deletePolicy],
]) {
  assert.match(policy, /owner = auth\.uid\(\)/, `${label} policy mevcut owner yolunu korumali`)
  assert.match(
    policy,
    /\(storage\.foldername\(name\)\)\[2\] = app_private\.current_public_user_id\(\)::text/,
    `${label} policy user-avatar public id yolunu da kabul etmeli`,
  )
  assert.match(policy, /app_private\.is_admin\(\)/, `${label} policy admin bakimini korumali`)
  assert.match(policy, /app_private\.is_fansub_staff/, `${label} policy fansub avatar bakimini korumali`)
}

assert.match(uploadsService, /function uploadUserAvatar\(file: File, userId: string\)/)
assert.match(
  uploadsService,
  /uploadPublicFile\('user_avatar', `user-avatars\/\$\{normalizedUserId\}`, normalizedFile\)/,
  'frontend avatar fallback yolu public users.id segmentini kullanmaya devam etmeli',
)

console.log('PASS Supabase avatar storage user path policy contract kept')
