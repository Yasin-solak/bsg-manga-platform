/**
 * SEO sitemap + robots contract.
 *
 * Intent: the build always produces sitemap.xml + robots.txt; if the manga catalog
 * cannot be read the build does NOT BREAK (continues with static routes). robots.txt excludes admin and
 * test surfaces from crawling and points to the sitemap with an absolute URL.
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const source = fs.readFileSync(path.join(root, 'scripts/prerender-routes.mjs'), 'utf8')

assert.match(source, /sitemap\.xml/, 'the prerender step must produce sitemap.xml')
assert.match(source, /robots\.txt/, 'prerender adimi robots.txt uretmelidir')
assert.match(
  source,
  /is_active=eq\.true&is_approved=eq\.true/,
  'the sitemap must include only active+approved mangas',
)
assert.match(
  source,
  /catch[\s\S]{0,200}continuing with static routes/,
  'if the catalog cannot be read the build must not break and must continue with a static sitemap',
)
for (const blockedPath of ['/admin', '/test', '/fansub-yonet', '/onboarding']) {
  assert.match(
    source,
    new RegExp(`'${blockedPath.replace(/\//g, '\\/')}'`),
    `robots.txt ${blockedPath} yuzeyini taramadan haric tutmalidir`,
  )
}
assert.match(source, /`Disallow: \$\{localizePathname\(routePath, 'tr'\)\}`/, 'Turkce adresleri de haric tutar')
assert.match(source, /`Disallow: \$\{localizePathname\(routePath, 'en'\)\}`/, 'Ingilizce adresleri de haric tutar')
assert.match(source, /Sitemap: \$\{siteOrigin\}\/sitemap\.xml/, 'robots.txt must give the sitemap address as an absolute URL')

// RFC 9116 security.txt: which channel a security researcher uses to report a vulnerability
// must be published in a standard format. Contact and Expires are required
// fields; if Expires falls in the past the file counts as invalid.
const securityTxt = fs.readFileSync(path.join(root, 'public/.well-known/security.txt'), 'utf8')
assert.match(securityTxt, /^Contact: (mailto:.+@.+|https:\/\/\S+)$/m, 'security.txt must carry a Contact field (mailto or https, RFC 9116)')
const expiresMatch = securityTxt.match(/^Expires: (.+)$/m)
assert.ok(expiresMatch, 'security.txt must carry an Expires field (required by RFC 9116)')
assert.ok(
  new Date(expiresMatch[1]).getTime() > Date.now(),
  'the security.txt Expires date must be in the future; past it the file is invalid',
)

console.log('PASS seo sitemap + robots + security.txt contract kept')
