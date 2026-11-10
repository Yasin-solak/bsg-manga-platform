/**
 * Explore: a search-first surface.
 *
 * The prototype's WRITTEN spec (BSG Prototip.dc.html tour note):
 * Explore really searches: live suggestions by title, translator and genre,
 * recent searches, sorting and filtering.
 * The screen is not in the file, so there is no artboard to measure; what is protected is
 * this behavior spec.
 *
 * Protected intent:
 * 1. The page has its OWN search input. The infrastructure was already there (`?q=`,
 * debounce, `listMangas({ search })`); the only missing thing was the input.
 * 2. Search and filter ON TOP. Measured: sort chips were 6.7 screens down on a phone.
 * 3. Recent searches are kept ON THE DEVICE and can be deleted.
 * 4. The showcase retracts while searching.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

/*
 * Line endings are NORMALIZED: the repo has CRLF on Windows and multi-line assertions silently
 * did not match.
 *
 * Split/join is used, NOT regex: heredoc escaping repeatedly ate the backslash and
 * broke the rule.
 */
const CR = String.fromCharCode(13)

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8').split(CR).join('')
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

const page = [read('src/pages/ExplorePage.tsx'), read('src/pages/explore/useExploreData.ts'), read('src/pages/explore/ExploreDesktopView.tsx')].join('\n')
const bar = read('src/pages/explore/ExploreSearchBar.tsx')

// ---------- A) Son aramalar deposu: sirali, tekil, silinebilir ----------
{
  const store = {}
  globalThis.window = {
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value) },
      removeItem: (key) => { delete store[key] },
    },
  }

  const mod = loadModule('src/lib/recentSearches.ts')

  assert.deepEqual(mod.readRecentSearches(), [], 'bos baslar')

  mod.rememberRecentSearch('kule')
  mod.rememberRecentSearch('safak')
  assert.deepEqual(
    mod.readRecentSearches(),
    ['safak', 'kule'],
    'the latest search must be first',
  )

  mod.rememberRecentSearch('KULE')
  assert.deepEqual(
    mod.readRecentSearches(),
    ['KULE', 'safak'],
    'the same query with a case difference must not open a SECOND row, it must move up',
  )

  mod.rememberRecentSearch('   ')
  assert.equal(
    mod.readRecentSearches().length,
    2,
    'a query made only of spaces must not be saved',
  )

  for (const q of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) mod.rememberRecentSearch(q)
  assert.equal(
    mod.readRecentSearches().length,
    mod.RECENT_SEARCH_LIMIT,
    'the list must not grow unbounded; it would be an ARCHIVE, not history',
  )

  const afterForget = mod.forgetRecentSearch('g')
  assert.ok(!afterForget.includes('g'), 'a single record must be deletable')
  assert.deepEqual(mod.clearRecentSearches(), [], 'tumu temizlenebilmeli')

  // A broken record must not blow up the page.
  store['bsgmanga:recent-searches'] = '{bozuk'
  assert.deepEqual(mod.readRecentSearches(), [], 'a broken record must be silently ignored')

  delete globalThis.window
}

// ---------- B) The page's own search input ----------
{
  assert.match(bar, /data-testid="explore-search-input"/)
  assert.match(
    page,
    /<ExploreSearchBar/,
    'Explore must render its own search bar; the top bar command palette is not enough',
  )
  assert.match(
    page,
    /value=\{searchQuery\}[\s\S]{0,80}onChange=\{setSearchQuery\}/,
    'the input must be tied to the existing search state (the plumbing is already there)',
  )
}

// ---------- C) Search and filter ON TOP ----------
{
  const jsxStart = page.indexOf('  return (\n    <div className="min-h-screen')
  assert.ok(jsxStart > 0, 'the page JSX return must be found')
  const jsx = page.slice(jsxStart)

  const headerIndex = jsx.indexOf('data-testid="explore-search-header"')
  const editorIndex = jsx.indexOf('<ExploreEditorPicksSection')
  const resultsIndex = jsx.indexOf('<ExploreResultsSection')
  assert.ok(headerIndex > 0 && editorIndex > 0 && resultsIndex > 0)
  assert.ok(
    headerIndex < editorIndex && headerIndex < resultsIndex,
    'the search/filter strip must come BEFORE the showcase and results',
  )

  assert.match(
    jsx,
    /data-testid="explore-search-header"[\s\S]{0,200}?sticky/,
    'the strip must stay on screen while scrolling',
  )
  /*
   * INTENT UPDATED: this assertion said "the filter strip is inside the title".
   * When the user shared the prototype's Explore screen the filter became a SEPARATE BUTTON and
   * BOTTOM SHEET (as in the prototype). What is protected has not changed: the filter entry must be
   * ON THE FIRST SCREEN, not buried at the bottom of the results section.
   */
  assert.match(
    jsx,
    /data-testid="explore-filter-trigger"/,
    'the filter input must be reachable in the top block',
  )
  assert.doesNotMatch(
    jsx,
    /toolbar=\{\(\s*\n\s*<ExploreToolbar/,
    'the toolbar must not be buried back inside the results section (it sat 6.7 screens down there)',
  )
}

// ---------- D) Arama varken vitrin cekilir ----------
{
  assert.match(
    page,
    /const isSearching = debouncedSearch\.trim\(\)\.length > 0/,
    'the measure must be the DEBOUNCED query; the page jumps if the showcase toggles on every keystroke',
  )
  assert.match(
    page,
    /\{isSearching \? null : \(/,
    'arama varken editoryal raflar cizilmemeli',
  )
  /*
   * Choosing a filter DOES NOT CLOSE the showcase: the user may still be browsing there,
   * and onboarding preferences can pick a genre on first load;
   * tying it to the filter would remove the showcase by itself.
   */
  assert.doesNotMatch(
    page,
    /const isSearching = [^\n]*activeFilterCount/,
    'showcase visibility must not depend on the filter count',
  )
}

// ---------- E) Gecmis paneli tekrar acilabilir olmali ----------
{
  /*
   * Binding only to `onFocus` was blind: after Enter the panel closes but the input stays focused
   * in the DOM, when the user clears the field no NEW focus event fires and
   * history never reopens.
   */
  assert.match(bar, /onChange=\{\(event\) => \{ onChange\(event\.target\.value\); setFocused\(true\) \}\}/)
  assert.match(bar, /onClick=\{\(\) => setFocused\(true\)\}/)
  assert.match(
    bar,
    /const showRecent = focused && value\.trim\(\)\.length === 0 && recent\.length > 0/,
    'history must show only when the field is EMPTY; while typing the user wants results',
  )
  assert.match(
    bar,
    /document\.addEventListener\('pointerdown', handlePointerDown\)/,
    'disari tiklayinca kapanmali; blur gecmis satirina basmayi yutuyordu',
  )
  assert.match(
    bar,
    /if \(trimmed\) setRecent\(rememberRecentSearch\(trimmed\)\)/,
    'a query must be remembered only after it RUNS, not on every keystroke',
  )
}

console.log('explore-search-contract: OK')
