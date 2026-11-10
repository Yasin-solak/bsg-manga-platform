import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const appSource = read('src/App.tsx')
const metaSource = read('src/components/common/AppDocumentMeta.tsx')
const metaLibSource = read('src/lib/documentMeta.ts')

assert.match(appSource, /import AppDocumentMeta from ['"]@\/components\/common\/AppDocumentMeta['"]/)
assert.match(appSource, /<AppDocumentMeta \/>/)
assert.match(metaSource, /useLocation\(\)/)
assert.match(metaSource, /document\.title = meta\.title/)
assert.match(metaSource, /upsertMeta\('description', meta\.description\)/)
assert.match(metaSource, /upsertMeta\('og:title', meta\.title, 'property'\)/)
assert.match(metaSource, /upsertMeta\('robots', meta\.robots\)/)
assert.match(metaSource, /upsertCanonical\(meta\.canonicalUrl\)/)
assert.match(metaSource, /resolveDocumentMetaState/)
assert.match(metaLibSource, /export function resolveDocumentMeta\(/)
assert.match(metaLibSource, /export function resolveDocumentMetaState\(/)

console.log('PASS route based title and meta management wired at the app entry')
