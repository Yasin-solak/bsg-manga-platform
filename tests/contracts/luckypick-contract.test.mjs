import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/*
 * TypeScript IS NOT imported DIRECTLY.
 *
 * The first version used `import ... from '../../src/lib/luckyPick.ts'`;
 * it worked locally (Node 24, type stripping by default), failed in CI (Node 20) and
 * the `quality` gate went red. Other contracts in the repo transpile and run
 * the source; we use the same pattern.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

function loadModule(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  const stub = new Proxy({}, {
    get: () => new Proxy(() => ({}), { get: () => () => {} }),
  })
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, (id) => (id === '@/i18n/activeLocale' ? { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) } : stub))
  return shim.exports
}

const { pickLucky, luckyReasonLabel, MIN_GENRE_SIGNALS, PREFERRED_POOL_RATIO } =
  loadModule('src/lib/luckyPick.ts')

/**
 * "Lucky pick" weighted selection contract.
 *
 * The user's rule: if genres are known that genre's chance is slightly higher but
 * NOT EVERY TIME; if unknown, plain random. Randomness is injected, so
 * these can be tested deterministically.
 */

const catalog = [
  { id: 'a', genres: ['Aksiyon'] },
  { id: 'b', genres: ['Fantastik'] },
  { id: 'c', genres: ['Romantik'] },
  { id: 'd', genres: ['Korku'] },
]
const signals = ['Aksiyon', 'Fantastik', 'Macera']

/** Sirayla sabit degerler donduren zar. */
const dice = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)] }

// ---------- A) NO WEIGHTING with weak signals ----------
// Claiming "your genre" from one genre is a guess, not data.
{
  const r = pickLucky({
    candidates: catalog, genreSignals: ['Aksiyon'], excludeIds: new Set(), random: dice(0),
  })
  assert.equal(r.reason, 'random', 'below the threshold it must be plain random')
  assert.equal(luckyReasonLabel(r), 'Tamamen rastgele')
}

// ---------- B) With enough signals and the dice in the preference slice ----------
{
  const r = pickLucky({
    candidates: catalog, genreSignals: signals, excludeIds: new Set(),
    random: dice(0.1, 0), // 0.1 < 0.6 -> tercih havuzu
  })
  assert.equal(r.reason, 'preferred')
  assert.ok(['a', 'b'].includes(r.manga.id), 'must come from the preference pool')
  assert.match(luckyReasonLabel(r), /sevdiğin için/)
}

// ---------- C) If the dice land in the SURPRISE slice genre match is NOT SOUGHT ----------
// A "lucky pick" always returning your own genre stops being luck.
{
  const r = pickLucky({
    candidates: catalog, genreSignals: signals, excludeIds: new Set(),
    random: dice(0.9, 0.99), // 0.9 > 0.6 -> tum katalog, sonra son eleman
  })
  assert.equal(r.reason, 'surprise')
  assert.equal(luckyReasonLabel(r), 'Sürpriz')
}

// ---------- D) Followed/read series LEAVE THE POOL ----------
// Otherwise the most likely result would be a series the user already knows.
{
  const r = pickLucky({
    candidates: catalog, genreSignals: signals,
    excludeIds: new Set(['a', 'b']), random: dice(0.1, 0),
  })
  assert.ok(!['a', 'b'].includes(r.manga.id), 'an eliminated series must not be selected')
}

// ---------- E) NO EMPTY SCREEN if everything is filtered out ----------
{
  const r = pickLucky({
    candidates: catalog, genreSignals: signals,
    excludeIds: new Set(['a', 'b', 'c', 'd']), random: dice(0),
  })
  assert.ok(r.manga, 'filtering must loosen and still return a series')
  assert.equal(r.reason, 'reread')
}

// ---------- F) Threshold and ratio from ONE SOURCE ----------
assert.equal(MIN_GENRE_SIGNALS, 3)
assert.equal(PREFERRED_POOL_RATIO, 0.6)

// ---------- G) Tur karsilastirmasi buyuk/kucuk harf duyarsiz ----------
{
  const r = pickLucky({
    candidates: [{ id: 'x', genres: ['aksiyon'] }, { id: 'y', genres: ['Korku'] }],
    genreSignals: ['AKSİYON', 'Fantastik', 'Macera'],
    excludeIds: new Set(), random: dice(0.1, 0),
  })
  assert.equal(r.manga.id, 'x', 'tur eslesmesi harf buyuklugune takilmamali')
}

console.log('PASS lucky weighted selection contract verified')
