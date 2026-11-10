/**
 * Series detail header: prototype design alignment.
 *
 * Protected intent (all from the user's prototype/screen comparison):
 * 1. Details are HORIZONTAL ON PHONES too. A vertical break made the cover alone take a screen's
 * height on the exact target screen.
 * 2. Tab LABELS and the "Report" text do not hide on mobile. Three icons made users guess
 * which was which.
 * 3. "...more" is decided by REAL OVERFLOW, not a character threshold.
 * 4. Numbers in localized format; no manual division/`toFixed`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function loadModule(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  const stub = new Proxy({}, { get: () => new Proxy(() => ({}), { get: () => () => {} }) })
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, (id) => (id === '@/i18n/activeLocale' ? { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) } : stub))
  return shim.exports
}

const utils = loadModule('src/pages/mangaDetail/mangaDetailPage.utils.ts')
const hero = read('src/pages/mangaDetail/MangaDetailHeroCard.tsx')

// ---------- A) Sayilar Turkce bicimde ----------
{
  assert.equal(utils.formatMangaRating(4.85), '4,9', 'the decimal separator must be a comma')
  assert.equal(utils.formatMangaRating(4), '4,0')

  /*
   * The old calculation was `(views / 1000).toFixed(0) + 'K'`: 400 views said "0K",
   * 500 views "1K". The two assertions below exist to catch exactly that bug.
   */
  assert.ok(
    !utils.formatCompactCount(400).startsWith('0'),
    '400 views must not look like "0K"',
  )
  assert.equal(utils.formatCompactCount(400), '400', 'no abbreviation below a thousand')
  assert.match(utils.formatCompactCount(184000), /184/, '184.000 -> "184 B"')
  assert.ok(
    !utils.formatCompactCount(184000).includes('K'),
    'Turkish abbreviation "B" (bin); "K" is English',
  )
}

// ---------- B) Kunye telefonda da yatay ----------
{
  assert.match(
    hero,
    /<div className="flex gap-3\.5 p-\[15px\]">/,
    'the header row must be unconditionally horizontal',
  )
  assert.doesNotMatch(
    hero,
    /flex-col sm:flex-row/,
    'the vertical breakpoint must not return on mobile (the cover covered the whole screen)',
  )
  assert.match(
    hero,
    /h-\[168px\] w-\[126px\]/,
    'the cover must be prototype size (126x168)',
  )
}

// ---------- C) Tab label and "Report" text DO NOT HIDE on mobile ----------
{
  assert.doesNotMatch(
    hero,
    /hidden sm:inline/,
    'hiding text on mobile is forbidden: tabs and Report were falling to icon only',
  )
  assert.match(hero, /\{txa\(tab\.label\)\}/, 'the tab label must print unconditionally')
  assert.match(hero, /data-testid="manga-report-button"/)
  assert.match(hero, /<Flag className="size-\[15px\]" \/>\s*\{txa\('Raporla'\)\}/, 'the "Raporla" text must be visible')
}

// ---------- D) "...devami" gercek tasmayla belirlenir ----------
{
  assert.match(
    hero,
    /node\.scrollHeight > node\.clientHeight \+ 1/,
    'the button decision must come from real overflow',
  )
  assert.doesNotMatch(
    hero,
    /description\.length > \d+/,
    'karakter esigi geri gelmemeli: dar kolonda 107 karakter bile bes satir oluyordu',
  )
  assert.match(
    hero,
    /window\.addEventListener\('resize', measureDescription\)/,
    'the measure must refresh when the width changes',
  )
  assert.match(
    hero,
    /!descExpanded && 'line-clamp-3'/,
    'collapsed it must clip at three lines',
  )
}

// ---------- E) Elle sayi bicimlendirmesi geri gelmemeli ----------
{
  assert.doesNotMatch(hero, /toFixed\(1\)/, 'the rating must be formatted with Intl')
  assert.doesNotMatch(hero, /\/ 1000/, 'views must not be split by hand')
}

console.log('manga-detail-hero-contract: OK')
