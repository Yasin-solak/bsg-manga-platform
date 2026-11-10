import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const assetUrlServiceSource = read('src/services/assetUrlService.ts')
const uploadsSource = read('src/services/storageService/uploads.ts')
const mangaSharedMappersSource = read('src/services/mangaService/shared.mappers.ts')
const fansubManageSharedSource = read('src/services/fansubManageService/shared.ts')
const fansubManageChaptersSource = read('src/services/fansubManageService/chapters.ts')

assert.match(assetUrlServiceSource, /const CHAPTER_PAGE_BUCKET = 'chapter-pages'/)
assert.match(assetUrlServiceSource, /const CHAPTER_PAGE_SCHEME = 'chapter-pages:\/\/'/)
assert.match(assetUrlServiceSource, /VITE_CHAPTER_PAGE_PUBLIC_BASE_URL/)
assert.match(assetUrlServiceSource, /export function resolveChapterPageUrl\b/)
assert.match(assetUrlServiceSource, /export function toChapterPageRef\b/)
assert.match(assetUrlServiceSource, /export function normalizeChapterPageRef\b/)

assert.match(uploadsSource, /toChapterPageRef/)
assert.match(uploadsSource, /uploadPublicFile\('chapter_page', pagePath, file, \{ response: 'objectPath' \}\)/)

assert.match(mangaSharedMappersSource, /resolveChapterPageUrl/)
assert.match(fansubManageSharedSource, /normalizeChapterPageRef/)
assert.match(fansubManageChaptersSource, /normalizeChapterPageRef/)

console.log('PASS chapter page R2 ref contract kept')
