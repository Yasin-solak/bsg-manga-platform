import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/*
 * Multilingual text coverage: every tx('...') / txa('...') text in the source must have an
 * English equivalent in messages/enText.ts (no half translations in production).
 * The key is the Turkish text itself; JS escapes are written the same way.
 */
const root = process.cwd()
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(name)) files.push(full)
  }
}
walk(path.join(root, 'src'))
// i18n altyapisinin kendisi (yorumlardaki ornekler) taranmaz.
const scanned = files.filter((file) => !path.relative(root, file).split(path.sep).join('/').startsWith('src/i18n/'))

const enDir = path.join(root, 'src/i18n/messages/en')
const enSource = readdirSync(enDir).map((name) => readFileSync(path.join(enDir, name), 'utf8')).join('\n')
const keys = new Set([...enSource.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]))

const missing = []
let used = 0
for (const file of scanned) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\btxa?\(\s*'((?:[^'\\]|\\.)*)'/g)) {
    used += 1
    if (!keys.has(match[1])) missing.push(`${path.relative(root, file)}: ${match[1]}`)
  }
}
assert.equal(missing.length, 0, `Ingilizce karsiligi olmayan metinler:\n${missing.join('\n')}`)
assert.ok(used > 0)

// The English dictionary is not in the main bundle.
for (const file of ['src/i18n/activeLocale.ts', 'src/i18n/LocaleProvider.tsx', 'src/lib/documentMeta.ts', 'src/main.tsx']) {
  assert.doesNotMatch(readFileSync(path.join(root, file), 'utf8'), /^import .*messages\/enText/m, `${file} must not load the dictionary statically`)
}
assert.match(readFileSync(path.join(root, 'src/i18n/activeLocale.ts'), 'utf8'), /await import\('\.\/messages\/enText'\)/)
console.log(`PASS multi-language text coverage (${used} tx uses, ${keys.size} English texts)`)
