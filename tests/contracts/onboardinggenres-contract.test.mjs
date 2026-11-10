/**
 * Onboarding genre and recommendation step contract.
 *
 * Protected decisions:
 *
 * 1. AT LEAST 3 GENRES REQUIRED (same as the prototype). The recommendation step depends entirely on this
 * choice; a "for you" list from zero/few choices would be nothing but
 * popularity order.
 * 2. GENRES ARE SAVED BEFORE THE RECOMMENDATION STEP. `get_recommended_mangas`
 * reads the user's SAVED genre profile; leaving it to the end would run the step
 * with an empty profile.
 * 3. GENRE NAME MATCHING is canonicalized ON BOTH SIDES. Canonical ids are
 * ENGLISH ('action'), card slugs are TURKISH ('aksiyon'). Converting only the
 * catalog side matched NO genre except 'drama'; measured: Action's 50 series never appeared on the card.
 * 4. The same genre can have two names (in the catalog "Dram" 38 + "Drama" 1);
 * counts are SUMMED, one does not overwrite the other.
 * 5. REASONS ARE NOT INVENTED. With no matched genre it says "popular"; no fake
 * personalization.
 * 6. The genre stats RPC IS NOT SECURITY DEFINER: counting must run on the catalog the caller
 * can see, otherwise series hidden by the 18+ gate are counted too and the number lies.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/^\s*--.*$/gm, '')

const genresStep = stripComments(read('src/pages/onboarding/OnboardingGenresStep.tsx'))
const onboardingPage = stripComments(read('src/pages/OnboardingPage.tsx'))
const recStep = read('src/pages/onboarding/OnboardingRecommendationsStep.tsx')
const migration = stripComments(read('supabase/migrations/20260821140000_set_my_birth_date.sql'))

// 1. En az 3.
assert.match(genresStep, /export const MIN_GENRE_COUNT = 3/, 'the lower limit must be 3')
assert.match(
  onboardingPage,
  /draft\.genres\.length < MIN_GENRE_COUNT[\s\S]{0,200}?return/,
  'eksik secimle ilerlenememeli',
)

// 2. Kayit oneri adimindan ONCE.
assert.match(
  onboardingPage,
  /activeStep\.id === 'genres'[\s\S]*?updateMyPreferredGenres\([\s\S]*?setActiveStepIndex/,
  'turler oneri adimina gecmeden once kaydedilmeli',
)

// 3-4. Iki tarafli kanoniklestirme + toplama.
assert.match(
  genresStep,
  /toCanonicalGenreId\(normalizeGenreId\(stat\.genre\)\)/,
  'katalog tarafi kanoniklestirilmeli',
)
assert.match(
  genresStep,
  /statBySlug\.get\(toCanonicalGenreId\(genre\.slug\)\)/,
  'the CARD SIDE must be canonicalized too; a one-sided conversion only matched drama',
)
assert.match(
  genresStep,
  /seriesCount: current\.seriesCount \+ stat\.seriesCount/,
  'two records landing on the same genre must add up, not overwrite each other',
)

// 5. Gerekce davranisi — modul transpile edilip CALISTIRILIR.
{
  const { outputText } = ts.transpileModule(
    `${recStep.slice(recStep.indexOf('function reasonLabel'), recStep.indexOf('export default'))}\nmodule.exports = { reasonLabel }`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  )
  const shim = { exports: {} }
  // Metin katmani gercek davranisiyla: Turkce etkin dilde sablon doldurulur.
  const txa = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole))
  new Function('module', 'exports', 'txa', outputText)(shim, shim.exports, txa)
  const { reasonLabel } = shim.exports

  assert.equal(reasonLabel([]), 'Şu an çok okunuyor', 'with no match no fake personalization')
  assert.equal(reasonLabel(['Aksiyon']), 'Aksiyon sevdiğin için')
  assert.equal(reasonLabel(['Aksiyon', 'Gizem']), 'Aksiyon ve Gizem sevdiğin için')
  assert.ok(
    !reasonLabel([]).includes('sevdiğin'),
    'an empty match must not say "because you like"',
  )
}

// 6. Sayim RPC'si invoker.
/*
 * The assertion narrows to the function's OWN body. The first version's regex scanned the whole
 * file; another function later added to the same migration (and rightly definer) raised a false alarm,
 * caught in CI.
 */
const genreStatsBlock = (() => {
  const start = migration.indexOf('create or replace function public.get_public_genre_stats')
  assert.ok(start >= 0, 'get_public_genre_stats must be defined in a migration')
  const next = migration.indexOf('create or replace function', start + 1)
  return migration.slice(start, next === -1 ? undefined : next)
})()

assert.match(
  genreStatsBlock,
  /security invoker/,
  'genre count must come from the catalog the caller can see (NOT definer)',
)
assert.ok(
  !/security definer/.test(genreStatsBlock),
  'with a definer count series hidden by the 18+ gate would also count',
)

console.log('PASS onboarding genre and suggestion step contract kept')
