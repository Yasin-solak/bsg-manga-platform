import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const headersSource = read('public/_headers')
const publicImageSource = read('functions/api/public-image.js')
const indexSource = read('index.html')

const cspLine = headersSource
  .split(/\r?\n/)
  .find((line) => line.trim().startsWith('Content-Security-Policy:')) || ''

assert.match(cspLine, /default-src 'self'/)
assert.match(cspLine, /base-uri 'self'/)
assert.match(cspLine, /object-src 'none'/)
assert.match(cspLine, /frame-ancestors 'self'/)
assert.match(cspLine, /script-src 'self'/)
assert.doesNotMatch(cspLine, /script-src[^;]*'unsafe-inline'/)
assert.match(cspLine, /connect-src 'self' https: wss:/)
assert.match(headersSource, /X-Content-Type-Options: nosniff/)
assert.match(headersSource, /Referrer-Policy: strict-origin-when-cross-origin/)
assert.match(headersSource, /Permissions-Policy: accelerometer=\(\), camera=\(\), geolocation=\(\)/)
assert.match(headersSource, /Cross-Origin-Opener-Policy: same-origin-allow-popups/)

assert.doesNotMatch(indexSource, /\sonload=/)
assert.match(indexSource, /CSP script-src inline handler gerektirmesin/)

assert.match(publicImageSource, /function applySecurityHeaders\(headers\)/)
assert.match(publicImageSource, /headers\.set\('x-content-type-options', 'nosniff'\)/)
assert.match(publicImageSource, /const upstreamContentType = upstream\.headers\.get\('content-type'\) \|\| ''/)
assert.match(publicImageSource, /if \(!\/\^image\\\/\/i\.test\(upstreamContentType\)\) \{/)
assert.match(publicImageSource, /headers\.delete\('set-cookie'\)/)

console.log('PASS security header and CSP contract kept')
