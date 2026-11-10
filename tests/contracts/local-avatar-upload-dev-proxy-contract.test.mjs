import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const viteConfigSource = read('vite.config.ts')
const cloudflareClientSource = read('src/services/storageService/cloudflareUploadClient.ts')
const uploadsSource = read('src/services/storageService/uploads.ts')
const proxySource = read('scripts/dev-user-avatar-upload-proxy.mjs')

assert.match(viteConfigSource, /createDevUserAvatarUploadMiddleware/)
assert.match(viteConfigSource, /name: 'dev-user-avatar-upload-proxy'/)
assert.match(viteConfigSource, /server\.middlewares\.use\(createDevUserAvatarUploadMiddleware\(\)\)/)

assert.match(cloudflareClientSource, /type CloudflareStorageUploadAvailabilityOptions = \{/)
assert.match(cloudflareClientSource, /allowLocalDev\?: boolean/)
assert.match(cloudflareClientSource, /return options\.allowLocalDev === true && import\.meta\.env\.DEV/)

assert.match(
  uploadsSource,
  /if \(canUseCloudflareStorageUpload\(\{ allowLocalDev: true \}\)\) \{/,
  'avatar upload must be opt-in via the localhost dev proxy',
)

assert.match(proxySource, /if \(intent !== 'user-avatar'\)/)
assert.match(proxySource, /SUPABASE_SERVICE_ROLE_KEY/)
assert.match(proxySource, /storage\.from\('avatars'\)\.upload\(objectPath, file/)
assert.match(proxySource, /getPublicUrl\(objectPath\)/)
assert.match(proxySource, /A user avatar cannot exceed the 2MB limit\./)

console.log('PASS local avatar upload dev proxy contract kept')
