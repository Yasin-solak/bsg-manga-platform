import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import {
  assertBuiltMediaConfiguration,
  assertProductionMediaBases,
  loadProductionFrontendEnv,
} from '../../scripts/lib/production-media-precheck.mjs'

const rootDir = fileURLToPath(new URL('../../', import.meta.url))
const storeKey = 'VITE_STORE_ASSET_PUBLIC_BASE_URL'
const chapterKey = 'VITE_CHAPTER_PAGE_PUBLIC_BASE_URL'
const storeBase = 'https://pub-store-fixture.r2.dev'
const chapterBase = 'https://pub-chapters-fixture.r2.dev/pages'
const validEnv = { [storeKey]: storeBase, [chapterKey]: chapterBase }
const expectedBases = assertProductionMediaBases(validEnv)

function script(content, relativePath = 'assets/arbitrary-name-18df.js') {
  return { relativePath, content }
}

function compiledResolver(store = JSON.stringify(storeBase), chapter = JSON.stringify(chapterBase)) {
  return `const s='store-assets://',c='chapter-pages://',a=n(${store}),b=n(${chapter});
    const first={scheme:s,publicBaseUrl:a},second={scheme:c,publicBaseUrl:b};
    function n(s){return typeof s==='string'?s.trim().replace(/\\/+$/g,''):null}
    export {first,second};`
}

for (const key of [storeKey, chapterKey]) {
  for (const value of [undefined, '', ' ', 'not-a-url', 'http://pub-fixture.r2.dev',
    'https://localhost', 'https://assets.local', 'https://127.0.0.1', 'https://10.0.0.4',
    'https://[::1]', 'https://example.com', 'https://media.invalid',
    'https://user:password@pub-fixture.r2.dev', 'https://pub-fixture.r2.dev?token=value',
    'https://pub-fixture.r2.dev#path', 'https://pub-fixture.r2.dev/has space']) {
    assert.throws(() => assertProductionMediaBases({ ...validEnv, [key]: value }),
      (error) => error.message.includes(key), `${key}: an invalid production base was accepted`)
  }
}
assert.equal(assertProductionMediaBases({ ...validEnv, [storeKey]: ` ${storeBase}/// ` })
  .get('store-assets://').base, storeBase)

assert.doesNotThrow(() => assertBuiltMediaConfiguration([script(compiledResolver())], expectedBases))
assert.doesNotThrow(() => assertBuiltMediaConfiguration([
  script(`const x={"scheme":\`store-assets://\`,"publicBaseUrl":'https:\\u002f\\u002fpub-store-fixture.r2.dev/'};`, 'assets/a.mjs'),
  script(`const y={scheme:'chapter-pages://',publicBaseUrl:\`${chapterBase}\`};`, 'assets/completely-renamed.js'),
], expectedBases))

for (const [content, reason] of [
  [compiledResolver('void 0', 'void 0'), 'old dist built with a missing environment'],
  [compiledResolver('null'), 'empty store base'],
  [compiledResolver(JSON.stringify('https://pub-previous.r2.dev')), 'old store base'],
  [compiledResolver(JSON.stringify(storeBase), JSON.stringify('https://pub-previous.r2.dev')), 'old chapter base'],
  [compiledResolver(JSON.stringify(chapterBase), JSON.stringify(storeBase)), 'two bases wired backwards'],
  [`${compiledResolver('void 0', 'void 0')}\n// ${storeBase} ${chapterBase}\nconst unrelated=${JSON.stringify(storeBase)};`, 'Yorum veya alakasız değişken'],
]) {
  assert.throws(() => assertBuiltMediaConfiguration([script(content)], expectedBases),
    /rebuild/i, reason)
}
assert.throws(() => assertBuiltMediaConfiguration([], expectedBases), /could not be verified/)
assert.throws(() => assertBuiltMediaConfiguration([
  script(compiledResolver(), 'assets/new.js'), script(compiledResolver('void 0'), 'assets/stale.js'),
], expectedBases), /does not match/, 'a valid chunk must not hide the error of a stale resolver chunk beside it')

const fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'bsgmanga-media-precheck-'))
const originalEnv = Object.fromEntries([storeKey, chapterKey].map((key) => [key, process.env[key]]))
try {
  delete process.env[storeKey]
  delete process.env[chapterKey]
  const precedenceDir = path.join(fixtureDir, 'precedence')
  await mkdir(precedenceDir)
  for (const [file, marker] of [
    ['.env', 'base'], ['.env.local', 'local'],
    ['.env.production', 'production'], ['.env.production.local', 'production-local'],
  ]) {
    await writeFile(path.join(precedenceDir, file),
      `${storeKey}=https://pub-${marker}.r2.dev\n${chapterKey}=${chapterBase}\n`, 'utf8')
  }
  assert.equal(loadProductionFrontendEnv(precedenceDir)[storeKey], 'https://pub-production-local.r2.dev')
  process.env[storeKey] = 'https://pub-runtime.r2.dev'
  assert.equal(loadProductionFrontendEnv(precedenceDir)[storeKey], 'https://pub-runtime.r2.dev')
  process.env[storeKey] = ''
  assert.throws(() => assertProductionMediaBases(loadProductionFrontendEnv(precedenceDir)), /is not defined/)
  delete process.env[storeKey]

  // We test minify format and scheme/base match by compiling the real resolver with Vite.
  const buildDir = path.join(fixtureDir, 'build')
  await mkdir(buildDir)
  await writeFile(path.join(buildDir, '.env.production'),
    `${storeKey}=${storeBase}\n${chapterKey}=${chapterBase}\n`, 'utf8')
  const resolverPath = path.join(rootDir, 'src/services/assetUrlService.ts').replace(/\\/g, '/')
  const output = await build({
    configFile: false,
    root: buildDir,
    mode: 'production',
    logLevel: 'silent',
    plugins: [{
      name: 'medya-kontrolu-supabase-izolasyonu',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id === './supabase' && importer?.replace(/\\/g, '/') === resolverPath) return '\0media-test-supabase'
      },
      load(id) {
        if (id === '\0media-test-supabase') {
          return 'export const supabase={storage:{from:()=>({getPublicUrl:path=>({data:{publicUrl:"https://supabase.invalid/"+path}})})}}'
        }
      },
    }],
    build: {
      write: false,
      minify: true,
      lib: { entry: resolverPath, formats: ['es'] },
      rollupOptions: { output: { entryFileNames: 'assets/renamed-[hash].js' } },
    },
  })
  const bundles = (Array.isArray(output) ? output : [output]).flatMap((item) => item.output)
    .filter((item) => item.type === 'chunk')
    .map((item) => script(item.code, item.fileName))
  assert.ok(bundles.length > 0)
  assert.doesNotThrow(() => assertBuiltMediaConfiguration(bundles, expectedBases))
  assert.throws(() => assertBuiltMediaConfiguration(bundles,
    assertProductionMediaBases({ ...validEnv, [storeKey]: 'https://pub-next-deployment.r2.dev' })), /does not match/)
} finally {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  const cleanupPath = path.resolve(fixtureDir)
  assert.equal(path.dirname(cleanupPath), path.resolve(os.tmpdir()))
  assert.ok(path.basename(cleanupPath).startsWith('bsgmanga-media-precheck-'))
  await rm(cleanupPath, { recursive: true, force: true })
}

console.log('PASS production media env, Vite priority and compiled resolver match kept')
