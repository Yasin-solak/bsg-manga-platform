import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const wranglerSource = read('wrangler.toml')
const uploadRouteSource = read('functions/api/storage/upload.js')
const uploadWorkerSource = read('functions/_shared/storage-upload-r2.js')
const chapterUploadSource = read('functions/_shared/storage-upload-chapter-page.js')
const communityUploadSource = read('functions/_shared/storage-upload-community-post-image.js')
const clientSource = read('src/services/storageService/cloudflareUploadClient.ts')

for (const binding of ['STORE_ASSETS_BUCKET', 'CHAPTER_PAGES_BUCKET', 'AVATARS_BUCKET', 'MANGA_COVERS_BUCKET']) {
  assert.match(wranglerSource, new RegExp(`binding = "${binding}"`), `${binding} wrangler binding eksik`)
}

assert.match(wranglerSource, /\[\[kv_namespaces\]\][\s\S]*binding = "UPLOAD_GUARD_KV"/)
assert.match(wranglerSource, /\[\[env\.production\.kv_namespaces\]\][\s\S]*binding = "UPLOAD_GUARD_KV"/)

assert.match(uploadRouteSource, /import \{ handleStorageUpload \} from '..\/..\/_shared\/storage-upload-r2'/)
assert.match(uploadRouteSource, /export async function onRequestPost\(context\)/)
assert.match(uploadRouteSource, /return handleStorageUpload\(context\.request, context\.env\)/)
assert.match(uploadRouteSource, /allow: 'POST'/)
assert.match(uploadRouteSource, /'x-content-type-options': 'nosniff'/)

assert.match(uploadWorkerSource, /import \{ normalizeUploadFile \} from '\.\/media-file-normalization'/)
assert.match(uploadWorkerSource, /'cache-control': 'no-store'/)
assert.match(uploadWorkerSource, /'x-content-type-options': 'nosniff'/)
assert.match(uploadWorkerSource, /await assertUploadRateLimit\(\{ request, env, authContext, intent \}\)/)
assert.match(uploadWorkerSource, /await assertUploadReplayGuard\(\{ env, intent, target: replayFingerprint \}\)/)
assert.match(uploadWorkerSource, /assertMimeAndSize\(file, \{/)
assert.match(chapterUploadSource, /const file = \(await normalizeUploadFileWithinLimit\(rawFile\)\)\.file/)
assert.match(communityUploadSource, /const file = \(await normalizeUploadFileWithinLimit\(rawFile, \{/)

assert.match(clientSource, /xhr\.open\('POST', '\/api\/storage\/upload'\)/)
assert.match(clientSource, /fetch\('\/api\/storage\/upload', \{/)

console.log('PASS Cloudflare upload deployment contract kept')
