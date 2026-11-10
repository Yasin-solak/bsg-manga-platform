import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadProjectEnv } from './lib/project-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const ssrOutDir = path.join(projectRoot, '.ssr-temp')
const defaultSiteOrigin = 'https://bsgmanga.pages.dev'

const prerenderRoutes = [
  '/',
  '/kesfet',
  '/fansublar',
  '/fansub-tier',
  '/topluluk',
  '/yayin-takvimi',
  '/listeler',
  '/magaza',
  '/yardim-merkezi',
  '/sss',
  '/iletisim',
  '/kurallar-ve-politikalar',
]

function resolveSiteOrigin() {
  const configuredOrigin = process.env.VITE_SITE_URL || process.env.SITE_URL

  if (!configuredOrigin) {
    return defaultSiteOrigin
  }

  try {
    return new URL(configuredOrigin).origin
  } catch {
    return defaultSiteOrigin
  }
}

function resolveOutputPath(routePath) {
  if (routePath === '/') {
    return path.join(distDir, 'index.html')
  }

  const normalizedPath = routePath.replace(/^\//, '')
  return path.join(distDir, normalizedPath, 'index.html')
}

function injectPrerenderedHtml(template, { appHtml, documentHead }) {
  return template
    .replace('<!--ssr-outlet-->', appHtml)
    .replace(/<!--app-head:start-->[\s\S]*?<!--app-head:end-->/, `<!--app-head:start-->\n    ${documentHead}\n    <!--app-head:end-->`)
}

async function resolveSsrEntryPath() {
  const candidates = ['entry-server.mjs', 'entry-server.js'].map((fileName) => path.join(ssrOutDir, fileName))

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  throw new Error('no entry-server output under .ssr-temp. Check the build:ssr step.')
}

const template = await readFile(path.join(distDir, 'index.html'), 'utf8')
const ssrEntryPath = await resolveSsrEntryPath()
const { render, localizePathname } = await import(pathToFileURL(ssrEntryPath).href)
const siteOrigin = resolveSiteOrigin()

// Every route in both languages: English at the root, Turkish under /tr. The template
// is read once because the English home page overwrites index.html.
const englishRoutes = prerenderRoutes.map((routePath) => localizePathname(routePath, 'en'))
const turkishRoutes = prerenderRoutes.map((routePath) => localizePathname(routePath, 'tr'))

for (const routePath of [...englishRoutes, ...turkishRoutes]) {
  const rendered = await render(routePath, { siteOrigin })
  const isTurkish = routePath === '/tr' || routePath.startsWith('/tr/')
  const html = injectPrerenderedHtml(isTurkish ? template.replace('<html lang="en">', '<html lang="tr">') : template, rendered)
  const outputPath = resolveOutputPath(routePath)

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, html, 'utf8')
}

await rm(ssrOutDir, { recursive: true, force: true })

console.log(`PASS prerendered ${englishRoutes.length + turkishRoutes.length} public routes (en + tr)`)

// ---------- SEO: sitemap.xml + robots.txt ----------
// Static routes + manga detail URLs from the live catalog. If the catalog cannot be read
// (no env / placeholder Supabase / network error) the build DOES NOT BREAK, a static-route
// sitemap is produced; the CI placeholder environment passes this way.

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (ch) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]
  ))
}

async function fetchPublicMangaSitemapEntries() {
  loadProjectEnv({ cwd: projectRoot })
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim()
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !anonKey) return []

  const endpoint = `${supabaseUrl}/rest/v1/mangas`
    + '?select=slug,updated_at&is_active=eq.true&is_approved=eq.true'
    + '&order=updated_at.desc&limit=2000'
  const response = await fetch(endpoint, {
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`mangas sitemap query returned ${response.status}`)
  const rows = await response.json()
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => typeof row.slug === 'string' && row.slug.trim())
    .map((row) => ({
      loc: `/manga/${encodeURIComponent(row.slug.trim())}`,
      lastmod: row.updated_at ? String(row.updated_at).slice(0, 10) : null,
    }))
}

let mangaEntries = []
try {
  mangaEntries = await fetchPublicMangaSitemapEntries()
} catch (error) {
  console.warn(`WARNING could not get the sitemap manga list (${error?.message || error}); continuing with static routes.`)
}

const canonicalEntries = [
  ...prerenderRoutes.map((routePath) => ({ loc: routePath, lastmod: null })),
  ...mangaEntries,
]
// Both languages are listed; each address names the other with xhtml:link.
const sitemapEntries = canonicalEntries.flatMap((entry) => {
  const tr = localizePathname(entry.loc, 'tr')
  const en = localizePathname(entry.loc, 'en')
  return [{ ...entry, loc: en, tr, en }, { ...entry, loc: tr, tr, en }]
})

const sitemapXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...sitemapEntries.map((entry) => [
    '  <url>',
    `    <loc>${xmlEscape(siteOrigin)}${xmlEscape(entry.loc)}</loc>`,
    ...(entry.lastmod ? [`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`] : []),
    `    <xhtml:link rel="alternate" hreflang="tr" href="${xmlEscape(siteOrigin)}${xmlEscape(entry.tr)}" />`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(siteOrigin)}${xmlEscape(entry.en)}" />`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(siteOrigin)}${xmlEscape(entry.en)}" />`,
    '  </url>',
  ].join('\n')),
  '</urlset>',
  '',
].join('\n')

await writeFile(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8')

// robots.txt: admin/test/personal surfaces are not crawled; the sitemap needs an absolute URL,
// and the origin resolves at build time, so it is produced here rather than in static public/.
const robotsTxt = [
  'User-agent: *',
  ...['/admin', '/test', '/fansub-yonet', '/onboarding', '/giris'].flatMap((routePath) => [
    `Disallow: ${localizePathname(routePath, 'en')}`,
    `Disallow: ${localizePathname(routePath, 'tr')}`,
  ]),
  'Allow: /',
  '',
  `Sitemap: ${siteOrigin}/sitemap.xml`,
  '',
].join('\n')

await writeFile(path.join(distDir, 'robots.txt'), robotsTxt, 'utf8')

console.log(`PASS sitemap.xml (${sitemapEntries.length} URL, ${mangaEntries.length} manga) + robots.txt generated`)
