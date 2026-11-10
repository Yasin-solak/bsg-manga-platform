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

const migration = read('supabase/migrations/20260519235905_storage_and_remaining_rpc_hardening.sql')
const uploadsService = read('src/services/storageService/uploads.ts')

for (const rpcName of [
  'current_auth_session_id',
  'get_fansub_reward_metric_value',
  'is_user_eligible_for_fansub_identity_tag',
]) {
  assert.ok(migration.includes(`'${rpcName}'`), `${rpcName} direct RPC grant'i kapatilmali`)
}

for (const policyName of [
  'Authenticated upload avatars',
  'Authenticated upload chapter pages',
  'Authenticated upload manga covers',
  'Owner delete avatars',
  'Owner update avatars',
  'Owner delete chapter pages',
  'Owner update chapter pages',
  'Owner delete manga covers',
  'Owner update manga covers',
]) {
  assert.match(migration, new RegExp(`drop policy if exists "${policyName}" on storage\\.objects;`))
}

const avatarPolicy = blockAfter(migration, 'create policy "Scoped upload avatars"')
assert.match(avatarPolicy, /bucket_id = 'avatars'/)
assert.match(avatarPolicy, /user-avatars/)
assert.match(avatarPolicy, /fansub-drafts/)
assert.match(avatarPolicy, /public\.is_fansub_staff/)
assert.match(avatarPolicy, /owner = auth\.uid\(\)/)

const coverPolicy = blockAfter(migration, 'create policy "Scoped upload manga covers"')
assert.match(coverPolicy, /bucket_id = 'manga-covers'/)
assert.match(coverPolicy, /'mangas', 'manga-drafts'/)
assert.match(coverPolicy, /public\.current_app_role\(\) = 'admin'/)
assert.match(coverPolicy, /public\.is_fansub_staff/)

const chapterPolicy = blockAfter(migration, 'create policy "Scoped upload chapter pages"')
assert.match(chapterPolicy, /bucket_id = 'chapter-pages'/)
assert.match(chapterPolicy, /from public\.mangas m/)
assert.match(chapterPolicy, /substring\(\(storage\.foldername\(name\)\)\[1\] from '\^manga-\(\[0-9a-f-\]\+\)\$'\)::uuid/)
assert.match(chapterPolicy, /public\.is_fansub_staff\(m\.fansub_id\)/)

assert.match(uploadsService, /function buildMangaCoverFallbackBasePath/)
assert.match(uploadsService, /fansubs\/\$\{normalizedFansubId\}\/mangas\/\$\{normalizedMangaId\}\/cover/)
assert.match(uploadsService, /fansubs\/\$\{normalizedFansubId\}\/manga-drafts\/\$\{normalizedDraftKey\}\/cover/)
assert.match(uploadsService, /function buildFansubAvatarFallbackBasePath/)
assert.match(uploadsService, /fansubs\/\$\{normalizedFansubId\}\/avatar/)
assert.match(uploadsService, /fansub-drafts\/\$\{authUserId\}\/avatar/)

console.log('PASS storage and remaining RPC hardening contract kept')
