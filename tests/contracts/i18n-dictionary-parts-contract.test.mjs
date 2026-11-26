/**
 * English dictionary parts: text used only inside a panel loads with that panel; everything
 * else is in the core dictionary that every English page downloads before its first render.
 *
 * Pinned decisions:
 * 1. Every file in src/i18n/messages/en belongs to exactly one dictionary module: the core
 *    (enText.ts) or one panel part (enTextAdmin / enTextManage / enTextStudio).
 * 2. A part is loaded only through a dynamic import in activeLocale.ts and is wired to its route
 *    in App.tsx with lazyRoute(..., { enPart }). Nothing in the first-load bundle imports it.
 * 3. THE INVARIANT. A text may live in a part only when it is PROVEN panel-only: it appears as a
 *    string literal in at least one source file, and every file that contains it is reachable
 *    from the app entry only through that part's route. Otherwise an English page outside the
 *    panel would show the Turkish text. A text that cannot be proven (built at runtime, read
 *    from the database, used on both sides) belongs in a core dictionary file.
 * 4. Core and parts share no key, so the merge order at runtime does not matter.
 *
 * To fix a failure: move the listed entry (the whole line) from the panel dictionary file to a
 * core one, for example src/i18n/messages/en/ortak3.ts.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const toPosix = (value) => value.split(path.sep).join('/')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')

const ENTRY = 'src/main.tsx'
const APP = 'src/App.tsx'
const MESSAGES_DIR = 'src/i18n/messages'
const EN_DIR = `${MESSAGES_DIR}/en`

// ---------- 1) dictionary modules and the files they are made of ----------
const activeLocale = read('src/i18n/activeLocale.ts')
const partModules = Object.fromEntries(
  [...activeLocale.matchAll(/^\s*(\w+): \(\) => import\('\.\/messages\/(enText\w+)'\)/gm)].map((match) => [match[1], match[2]]),
)
assert.deepEqual(
  Object.keys(partModules).sort(),
  ['admin', 'manage', 'studio'],
  'activeLocale must load exactly the admin, manage and studio parts through dynamic imports',
)
assert.match(activeLocale, /import\('\.\/messages\/enText'\)/, 'the core dictionary must be a dynamic import too')
assert.doesNotMatch(activeLocale, /^import .*messages\/enText/m, 'activeLocale must not load any dictionary statically')

function dictionaryFilesOf(moduleName) {
  const source = read(`${MESSAGES_DIR}/${moduleName}.ts`)
  const imported = [...source.matchAll(/^import \{ (\w+) \} from '\.\/en\/(\w+)'$/gm)].map((match) => {
    assert.equal(match[1], match[2], `${moduleName}.ts: the export name must equal the file name (${match[2]})`)
    return match[2]
  })
  const spread = [...source.slice(source.indexOf('export const')).matchAll(/\.\.\.(\w+)/g)].map((match) => match[1])
  assert.deepEqual([...spread].sort(), [...imported].sort(), `${moduleName}.ts must spread exactly the files it imports`)
  assert.ok(imported.length > 0, `${moduleName}.ts must contain at least one dictionary file`)
  return imported
}

const groupOfFile = new Map()
const claim = (group, files) => {
  for (const file of files) {
    assert.ok(!groupOfFile.has(file), `messages/en/${file}.ts is in two dictionary modules (${groupOfFile.get(file)} and ${group})`)
    groupOfFile.set(file, group)
  }
}
claim('core', dictionaryFilesOf('enText'))
for (const [part, moduleName] of Object.entries(partModules)) claim(part, dictionaryFilesOf(moduleName))

const filesOnDisk = readdirSync(path.join(root, EN_DIR)).filter((name) => name.endsWith('.ts')).map((name) => name.replace(/\.ts$/, ''))
assert.deepEqual(
  [...groupOfFile.keys()].sort(),
  [...filesOnDisk].sort(),
  'every file in messages/en must be part of exactly one dictionary module (a file left out is never loaded)',
)

function parse(relativePath) {
  return ts.createSourceFile(relativePath, read(relativePath), ts.ScriptTarget.Latest, true, relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

const keysOfGroup = new Map([['core', new Map()], ...Object.keys(partModules).map((part) => [part, new Map()])])
for (const [file, group] of groupOfFile) {
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteralLike(node.name)) keysOfGroup.get(group).set(node.name.text, file)
    ts.forEachChild(node, visit)
  }
  visit(parse(`${EN_DIR}/${file}.ts`))
}

// ---------- 4) core and parts share no key ----------
for (const part of Object.keys(partModules)) {
  const shared = [...keysOfGroup.get(part).keys()].filter((key) => keysOfGroup.get('core').has(key))
  assert.deepEqual(shared, [], `texts in both the core and the ${part} dictionary (keep one copy)`)
  for (const other of Object.keys(partModules)) {
    if (other <= part) continue
    const both = [...keysOfGroup.get(part).keys()].filter((key) => keysOfGroup.get(other).has(key))
    assert.deepEqual(both, [], `texts in both the ${part} and the ${other} dictionary (a text shared by two panels belongs in the core)`)
  }
}

// ---------- 2) each part is wired to one route ----------
const appSource = read(APP)
const partRoutes = Object.fromEntries(
  [...appSource.matchAll(/lazyRoute\(\(\) => import\('([^']+)'\), \{ enPart: '(\w+)' \}\)/g)].map((match) => [match[2], match[1]]),
)
assert.deepEqual(Object.keys(partRoutes).sort(), Object.keys(partModules).sort(), 'App.tsx must wire each dictionary part to exactly one lazy route')
const lazyRouteSource = read('src/lib/lazyRoute.ts')
assert.match(
  lazyRouteSource,
  /ensureEnDictionaryPart\(enPart\)[\s\S]*?\.then\(loader\)/,
  'the part must be awaited BEFORE the page module is imported (text evaluated while the module loads)',
)

// ---------- source graph ----------
const sourceFiles = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) sourceFiles.push(toPosix(path.relative(root, full)))
  }
}
walk(path.join(root, 'src'))
const sourceFileSet = new Set(sourceFiles)

// Mirrors resolve.alias in vite.config.ts and paths in tsconfig.app.json.
const ALIASES = [
  ['@components/', 'src/components/'],
  ['@pages/', 'src/pages/'],
  ['@hooks/', 'src/hooks/'],
  ['@services/', 'src/services/'],
  ['@styles/', 'src/styles/'],
  ['@utils/', 'src/utils/'],
  ['@types/', 'src/types/'],
  ['@lib/', 'src/lib/'],
  ['@/', 'src/'],
]

function resolveImport(fromFile, specifier) {
  const clean = specifier.replace(/\?.*$/, '')
  let base = null
  if (clean === '@types') base = 'src/types'
  else if (clean.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean))
  else {
    const alias = ALIASES.find(([prefix]) => clean.startsWith(prefix))
    if (alias) base = alias[1] + clean.slice(alias[0].length)
  }
  if (!base) return null
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) => sourceFileSet.has(candidate)) ?? null
}

const literalsOf = new Map()
const importsOf = new Map()
for (const file of sourceFiles) {
  const literals = new Set()
  const imports = []
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literals.add(node.text)
    let specifier = null
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      const bindings = clause?.namedBindings
      const typeOnly = clause && (clause.isTypeOnly
        || (!clause.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly)))
      if (!typeOnly) specifier = node.moduleSpecifier.text
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
      specifier = node.moduleSpecifier.text
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0) {
      assert.ok(
        ts.isStringLiteralLike(node.arguments[0]),
        `${file}: import() with a computed path cannot be followed; the dictionary split relies on a complete import graph`,
      )
      specifier = node.arguments[0].text
    }
    if (specifier) {
      const target = resolveImport(file, specifier)
      if (target) imports.push({ target, specifier })
    }
    ts.forEachChild(node, visit)
  }
  visit(parse(file))
  literalsOf.set(file, literals)
  importsOf.set(file, imports)
}

function reachableFromEntry(cutSpecifierFromApp) {
  const seen = new Set([ENTRY])
  const queue = [ENTRY]
  while (queue.length > 0) {
    const file = queue.pop()
    for (const edge of importsOf.get(file) ?? []) {
      if (file === APP && edge.specifier === cutSpecifierFromApp) continue
      if (seen.has(edge.target)) continue
      seen.add(edge.target)
      queue.push(edge.target)
    }
  }
  return seen
}

const reachableAll = reachableFromEntry(null)
assert.ok(reachableAll.size > 500, 'the import graph from src/main.tsx looks broken (too few files reached)')

// ---------- 2 continued) nothing outside the server entry imports a part statically ----------
for (const file of sourceFiles) {
  if (file === 'src/entry-server.tsx' || file.startsWith(`${MESSAGES_DIR}/`)) continue
  for (const edge of importsOf.get(file) ?? []) {
    if (!edge.target.startsWith(`${MESSAGES_DIR}/enText`)) continue
    assert.equal(file, 'src/i18n/activeLocale.ts', `${file} must not import a dictionary module; use the loaders in activeLocale`)
  }
}

// ---------- 3) the invariant ----------
const violations = []
let partTexts = 0
for (const part of Object.keys(partModules)) {
  const keys = keysOfGroup.get(part)
  partTexts += keys.size
  const withoutPanel = reachableFromEntry(partRoutes[part])
  assert.ok(withoutPanel.size < reachableAll.size, `cutting the ${part} route must make its panel files unreachable`)
  const provenInsidePanel = new Set()
  for (const file of reachableAll) {
    if (file.startsWith(`${MESSAGES_DIR}/`)) continue
    const outsidePanel = withoutPanel.has(file)
    for (const literal of literalsOf.get(file)) {
      if (!keys.has(literal)) continue
      if (outsidePanel) violations.push(`[${part}] ${JSON.stringify(literal)} (en/${keys.get(literal)}.ts) is used by ${file}, which loads without the ${part} panel`)
      else provenInsidePanel.add(literal)
    }
  }
  for (const [key, file] of keys) {
    if (!provenInsidePanel.has(key)) violations.push(`[${part}] ${JSON.stringify(key)} (en/${file}.ts) has no literal use inside the ${part} panel, so it cannot be proven panel-only`)
  }
}
const uniqueViolations = [...new Set(violations)]
assert.equal(
  uniqueViolations.length,
  0,
  `texts that must move to a core dictionary file (${uniqueViolations.length}):\n${uniqueViolations.slice(0, 60).join('\n')}`,
)

console.log(`PASS English dictionary parts (${keysOfGroup.get('core').size} core texts, ${partTexts} panel-only texts in ${Object.keys(partModules).length} parts)`)
