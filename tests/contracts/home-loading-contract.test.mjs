import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const module = { exports: {} }
new Function('module', 'exports', ts.transpileModule(read('src/pages/home/loadHomeHero.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(module, module.exports)
const { loadHomeHero } = module.exports

// Network responses are resolved by hand: the showcase should depend only on its two requests.
let resolveConfig, resolveFeatured
let fallbackCalls = 0
const featured = [{ id: 'chosen-2' }, { id: 'chosen-1' }]
const pending = loadHomeHero({
  config: () => new Promise(resolve => { resolveConfig = resolve }),
  featured: ids => { assert.deepEqual(ids, ['chosen-2', 'chosen-1']); return new Promise(resolve => { resolveFeatured = resolve }) },
  trending: async () => { fallbackCalls++; throw new Error('Trend beklenmemeli') },
})
resolveConfig({ featuredMangaIds: ['chosen-2', 'chosen-1'] })
await Promise.resolve()
resolveFeatured(featured)
assert.deepEqual(await pending, featured)
assert.equal(fallbackCalls, 0)
for (const variant of ['empty-config', 'config-error', 'empty-featured', 'featured-error']) {
  const rows = await loadHomeHero({
    config: async () => { if (variant === 'config-error') throw new Error('network'); return { featuredMangaIds: variant === 'empty-config' ? [] : ['id'] } },
    featured: async () => { if (variant === 'featured-error') throw new Error('network'); return [] },
    trending: async limit => { assert.equal(limit, 5); return Array.from({ length: 8 }, (_, id) => ({ id })) },
  })
  assert.equal(rows.length, 5)
}
await assert.rejects(loadHomeHero({ config: async () => ({ featuredMangaIds: [] }), featured: async () => [], trending: async () => { throw new Error('offline') } }), /offline/)
const page = read('src/pages/HomePage.tsx')
assert.doesNotMatch(page, /await loadFeaturedHomeMangas/)
assert.match(page, /void loadHomeHero/)
assert.match(page, /!isDesktop \? <div/)
assert.match(page, /isDesktop \? <div data-page-shell/)
assert.match(read('src/pages/home/useDesktopHomeViewport.ts'), /min-width: 1024px/)
assert.equal((read('src/components/home/HomeHero.tsx').match(/sm:h-\[440px\]/g) || []).length, 2)
assert.equal((read('src/components/home/mobile/HomeMobileHero.tsx').match(/min-h-\[236px\]/g) || []).length, 2)
console.log('PASS independent showcase, sort, error/empty fallback, loading area and a single visible home tree')
