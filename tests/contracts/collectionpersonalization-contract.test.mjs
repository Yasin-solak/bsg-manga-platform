import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/**
 * Home collection personalization contract.
 *
 * The module is TRANSPILED and run; importing TS directly fails on Node 20 in CI
 * (learned once).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function loadModule(relativePath) {
  const source = readFileSync(path.join(rootDir, relativePath), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  // luckyPick'ten yalnizca esik sabiti geliyor; gercek degerle calisalim.
  const deps = { '../lib/luckyPick': { MIN_GENRE_SIGNALS: 3 } }
  const req = (id) => deps[id] ?? { MIN_GENRE_SIGNALS: 3 }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, req)
  return shim.exports
}

const { selectCollections } = loadModule('src/lib/collectionPersonalization.ts')

const pool = [
  { id: 'aksiyon', targetGenreId: 'action', sortOrder: 20 },
  { id: 'fantezi', targetGenreId: 'fantasy', sortOrder: 10 },
  { id: 'romantik', targetGenreId: 'romance', sortOrder: 30 },
  { id: 'dram', targetGenreId: 'drama', sortOrder: 40 },
  { id: 'korku', targetGenreId: 'horror', sortOrder: 70 },
  { id: 'okul', targetGenreId: 'school', sortOrder: 60 },
]

// ---------- A) NO PERSONALIZATION with weak signals ----------
// Saying "for you" from one signal would present a guess as data.
{
  const r = selectCollections({ collections: pool, genreSignals: ['horror'] })
  assert.equal(r.personalized, false)
  assert.deepEqual(r.items.map((i) => i.id), ['fantezi', 'aksiyon', 'romantik', 'dram'],
    'the default order must be sortOrder')
}

// ---------- B) With enough signals SIGNAL ORDER decides ----------
// The most-read genre should come first; sorting by sortOrder would waste half of personalization.
{
  const r = selectCollections({
    collections: pool, genreSignals: ['horror', 'school', 'romance'],
  })
  assert.equal(r.personalized, true)
  assert.deepEqual(r.items.slice(0, 3).map((i) => i.id), ['korku', 'okul', 'romantik'])
}

// ---------- C) If few match the rest is FILLED ----------
// Leaving a four-slot grid with two cards would make personalization look like a loss.
{
  const r = selectCollections({
    collections: pool, genreSignals: ['horror', 'school', 'sci-fi'],
  })
  assert.equal(r.items.length, 4)
  assert.deepEqual(r.items.slice(0, 2).map((i) => i.id), ['korku', 'okul'])
}

// ---------- D) Hicbiri eslesmiyorsa KISISELLESTIRILMIS DEME ----------
{
  const r = selectCollections({
    collections: pool, genreSignals: ['sci-fi', 'music', 'cooking'],
  })
  assert.equal(r.personalized, false, 'with no match it must not count as personalized')
}

// ---------- E) Ayni koleksiyon IKI KEZ cikmaz ----------
{
  const r = selectCollections({
    collections: pool, genreSignals: ['horror', 'school', 'action'],
  })
  assert.equal(new Set(r.items.map((i) => i.id)).size, r.items.length)
}


// ---------- F) TURKCE/INGILIZCE TUZAGI ----------
/*
 * In live data `mangas.genres` and `users.preferred_genres` are TURKISH
 * ("Aksiyon", "Doğaüstü"); collections' `targetGenreId` is English
 * ('action', 'supernatural'). This pin breaks if the caller passes signals without converting
 * to CANONICAL ids.
 *
 * Silently it goes unnoticed: with no match the function already returns the default order and
 * nothing looks "broken" on screen.
 */
{
  const ham = selectCollections({ collections: pool, genreSignals: ['Aksiyon', 'Korku', 'Okul'] })
  assert.equal(ham.personalized, false,
    'ham Turkce sinyal eslesmemeli — cagiran kanonik id vermeli')

  const kanonik = selectCollections({ collections: pool, genreSignals: ['action', 'horror', 'school'] })
  assert.equal(kanonik.personalized, true, 'must match by canonical id')
  assert.deepEqual(kanonik.items.slice(0, 3).map((i) => i.id), ['aksiyon', 'korku', 'okul'])
}

console.log('PASS collection personalization contract verified')
