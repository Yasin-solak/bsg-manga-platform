import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const sanitizerSources = [
  'src/services/communityMentionService/shared.ts',
  'src/services/adminService/shared.utils.ts',
  'src/services/adminOpsService/shared.ts',
  'src/services/adminUserService/shared.ts',
  'src/services/adminMangaListService/shared.ts',
  'src/services/mangaListService/lists.ts',
  'src/services/homepageConfigService.ts',
  'src/services/mangaService/discovery.list.ts',
  'src/services/fansubManageService/manga.ts',
]

for (const relativePath of sanitizerSources) {
  const source = read(relativePath)
  assert.match(
    source,
    /\[\\\\%_,\(\)\]/,
    `${relativePath} PostgREST .or filtre metakarakterlerini temizlemiyor`,
  )
}

const unsafeSearchSources = [
  'src/services/homepageConfigService.ts',
  'src/services/mangaService/discovery.list.ts',
  'src/services/adminService/shared.queries.search.ts',
]

for (const relativePath of unsafeSearchSources) {
  const source = read(relativePath)
  assert.doesNotMatch(
    source,
    /replace\(\s*\/\[%_,\]\//,
    `${relativePath} must not use the old comma/paren-missing sanitizer pattern`,
  )
}

console.log('PASS PostgREST filter sanitization contract kept')
