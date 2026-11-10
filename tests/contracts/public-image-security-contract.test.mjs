import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const source = readFileSync(path.join(rootDir, 'functions/api/public-image.js'), 'utf8')

assert.match(source, /const TRANSFORM_RATE_LIMIT_WINDOW_SECONDS = 60/)
assert.match(source, /const TRANSFORM_RATE_LIMIT_LONG_WINDOW_SECONDS = 10 \* 60/)
assert.match(source, /function buildCanonicalRequestUrl\(/)
assert.match(source, /if \(!isCanonicalRequestUrl\(requestUrl, canonicalUrl\)\) \{/)
assert.match(source, /status: 301/)
assert.match(source, /await assertTransformRateLimit\(context\)/)
assert.match(source, /return new Response\('Too Many Requests', \{/)
assert.match(source, /location: canonicalUrl\.toString\(\)/)

console.log('PASS public-image security contract kept')
