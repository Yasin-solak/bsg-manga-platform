import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const read = (relativePath) => readFileSync(path.resolve(root, relativePath), 'utf8')

// Cok dilli adresler (2026-11-03): tablo gercekten calistirilarak denetlenir.
const outDir = mkdtempSync(path.join(tmpdir(), 'i18n-routes-'))
const outFile = path.join(outDir, 'localizedRoutes.mjs')
// Tek bagimlilik (policyRoutes) yan dosyaya derlenir; '@/' takma adi goreli yola cevrilir.
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
try {
  writeFileSync(path.join(outDir, 'policyRoutes.mjs'), compile(read('src/lib/policyRoutes.ts')))
  writeFileSync(outFile, compile(read('src/i18n/localizedRoutes.ts')).replace("'@/lib/policyRoutes'", "'./policyRoutes.mjs'"))
  const routes = await import(pathToFileURL(outFile).href)
  const { localeFromPathname, toCanonicalPathname, localizePathname, localizeHref, legacyPathnameRedirect, DEFAULT_LOCALE } = routes

  assert.equal(DEFAULT_LOCALE, 'en', 'English is the default language')
  // The language comes only from the prefix.
  assert.equal(localeFromPathname('/'), 'en')
  assert.equal(localeFromPathname('/library'), 'en')
  assert.equal(localeFromPathname('/tr'), 'tr')
  assert.equal(localeFromPathname('/tr/kutuphane'), 'tr')
  assert.equal(localeFromPathname('/trending'), 'en', 'a slug starting with /tr is not Turkish')

  // Canonical -> addresses: path words are translated, parameters are kept.
  const cases = [
    ['/', '/', '/tr'],
    ['/kutuphane', '/library', '/tr/kutuphane'],
    ['/kesfet', '/explore', '/tr/kesfet'],
    ['/manga/one-piece', '/manga/one-piece', '/tr/manga/one-piece'],
    ['/manga/one-piece/bolum/5', '/manga/one-piece/chapter/5', '/tr/manga/one-piece/bolum/5'],
    ['/manga/bolum/bolum/3/ekip', '/manga/bolum/chapter/3/ekip', '/tr/manga/bolum/bolum/3/ekip'],
    ['/oku/naruto/12', '/read/naruto/12', '/tr/oku/naruto/12'],
    ['/profil/ahmet', '/profile/ahmet', '/tr/profil/ahmet'],
    ['/fansub/karanlik/yonet', '/fansub/karanlik/manage', '/tr/fansub/karanlik/yonet'],
    ['/magaza/urun/abc', '/shop/urun/abc', '/tr/magaza/urun/abc'],
    ['/oyunlar/gunun-kapagi', '/games/daily-cover', '/tr/oyunlar/gunun-kapagi'],
    ['/admin/kullanicilar', '/admin/kullanicilar', '/tr/admin/kullanicilar'],
  ]
  for (const [canonical, en, tr] of cases) {
    assert.equal(localizePathname(canonical, 'en'), en, `${canonical} -> ${en}`)
    assert.equal(localizePathname(canonical, 'tr'), tr, `${canonical} -> ${tr}`)
    assert.equal(toCanonicalPathname(en), canonical, `${en} -> ${canonical}`)
    assert.equal(toCanonicalPathname(tr), canonical, `${tr} -> ${canonical}`)
    assert.equal(legacyPathnameRedirect(en), null, `${en} is current`)
    assert.equal(legacyPathnameRedirect(tr), null, `${tr} is current`)
  }

  // Old links keep working: /en drops its prefix, unprefixed Turkish stays Turkish under /tr.
  assert.equal(legacyPathnameRedirect('/en'), '/')
  assert.equal(legacyPathnameRedirect('/en/library'), '/library')
  assert.equal(legacyPathnameRedirect('/en/kutuphane'), '/library')
  assert.equal(legacyPathnameRedirect('/kutuphane'), '/tr/kutuphane')
  assert.equal(legacyPathnameRedirect('/manga/naruto/bolum/5'), '/tr/manga/naruto/bolum/5')
  assert.equal(legacyPathnameRedirect('/english-manga'), null)

  // Search and hash are kept; external links are untouched.
  assert.equal(localizeHref('/magaza?sekme=premium#ust', 'en'), '/shop?sekme=premium#ust')
  assert.equal(localizeHref('/magaza?sekme=premium#ust', 'tr'), '/tr/magaza?sekme=premium#ust')
  assert.equal(localizeHref('https://discord.gg/x', 'tr'), 'https://discord.gg/x')
  assert.equal(localizeHref('//cdn.example.com/a.png', 'en'), '//cdn.example.com/a.png')
} finally {
  rmSync(outDir, { recursive: true, force: true })
}

// Baglanti katmani: yonlendirme adlari dil farkindalikli sarmalayicidan gelir.
const eslintConfig = read('eslint.config.mjs')
assert.match(eslintConfig, /importNames: \['Link', 'NavLink', 'Navigate', 'useNavigate', 'useSearchParams'\]/)
const app = read('src/App.tsx')
assert.match(app, /<Routes location=\{routeLocation\}>/, 'Rota agaci kanonik (Turkce) konumu gorur')
assert.match(app, /<LocaleProvider locale=\{locale\}>/)
assert.match(app, /document\.documentElement\.lang = LOCALE_TAG\[locale\]/)
assert.match(app, /legacyPathnameRedirect\(location\.pathname\)/, 'old addresses are redirected')
assert.match(read('public/_redirects'), /\/en\/\*\s+\/:splat\s+301/, 'old /en links redirect permanently')
assert.match(read('index.html'), /<html lang="en">/)
// SEO: hreflang for both languages + x-default, SSR and client from the same source.
const meta = read('src/lib/documentMeta.ts')
assert.match(meta, /hreflang="x-default"/)
assert.match(meta, /const meta = resolveDocumentMeta\(canonicalPathname\)/)
assert.match(read('src/components/common/AppDocumentMeta.tsx'), /upsertAlternates\(meta\.alternates\)/)
// Dil secici cercevede erisilebilir.
assert.match(read('src/components/layout/Footer.tsx'), /<LocaleSwitchLink/)
assert.match(read('src/components/layout/AppSidebar.tsx'), /<LocaleSwitchLink/)

console.log('PASS multi-language addresses (path translation, link layer, hreflang, language picker)')
