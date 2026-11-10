import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const packageSource = JSON.parse(read('package.json'))
const appSource = read('src/App.tsx')
const metaSource = read('src/components/common/AppDocumentMeta.tsx')
const metaLibSource = read('src/lib/documentMeta.ts')
const serverEntrySource = read('src/entry-server.tsx')
const prerenderScriptSource = read('scripts/prerender-routes.mjs')
const indexHtmlSource = read('index.html')

assert.equal(packageSource.scripts['build:ssr'], 'vite build --ssr src/entry-server.tsx --outDir .ssr-temp')
assert.equal(packageSource.scripts['build:prerender'], 'node scripts/prerender-routes.mjs')
assert.match(packageSource.scripts.build, /npm run build:ssr/)
assert.match(packageSource.scripts.build, /npm run build:prerender/)

assert.match(appSource, /import \{ lazyRoute, preloadLazyRoutes \} from ['"]@\/lib\/lazyRoute['"]/)
assert.match(appSource, /export async function preloadAppRouteModules\(\)/)
assert.match(serverEntrySource, /await preloadAppRouteModules\(\)/)
assert.match(serverEntrySource, /StaticRouter/)
assert.match(serverEntrySource, /renderToPipeableStream/)
assert.doesNotMatch(serverEntrySource, /renderToString/)
assert.match(serverEntrySource, /renderDocumentHeadTags/)
assert.match(metaSource, /resolveDocumentMetaState/)
assert.match(metaLibSource, /export function renderDocumentHeadTags/)
assert.match(prerenderScriptSource, /const prerenderRoutes = \[/)
assert.match(prerenderScriptSource, /localizePathname\(routePath, 'en'\)/, 'her rota Ingilizce karsiligiyla da uretilir')
assert.match(prerenderScriptSource, /hreflang="en"/, 'the sitemap declares language equivalents')
assert.match(indexHtmlSource, /<!--app-head:start-->/)
assert.match(indexHtmlSource, /<!--ssr-outlet-->/)

console.log('PASS post-build SSR prerender backbone and shared meta source wired')
