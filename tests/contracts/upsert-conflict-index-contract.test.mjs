/**
 * Each `onConflict` must have a FULL uniqueness target.
 *
 * **Why this guard exists.** PostgREST's `on conflict (a, b)` only matches a
 * FULL uniqueness target. It does not match a partial (`... where ...`) index
 * and Postgres returns 42P10. Users see "could not save";
 * nothing looks wrong in code, type checking passes and tests
 * pass too.
 *
 * This bug happened TWICE in the project: the first time a note went into the
 * migration, the second time it repeated with the same note unread. Protecting with a comment
 * was not enough; the check was handed to the machine.
 *
 * Valid targets: a full unique index, table-level `unique (...)` /
 * `primary key (...)`, and column-level `... unique` / `... primary key`.
 *
 * The guard is deliberately COARSE. If it raises a false alarm, making the target full is
 * the right fix anyway.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function collectFiles(dir, extension) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...collectFiles(full, extension))
    else if (entry.endsWith(extension)) found.push(full)
  }
  return found
}

const normalize = (columns) => columns.split(',').map((column) => column.trim()).join(',')

const migrationSql = collectFiles(path.join(rootDir, 'supabase', 'migrations'), '.sql')
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

const targets = new Set()

// 1) Full unique indexes. Expressions with `where` (partial) are DROPPED: this guard's
//    reason to exist is exactly that they do not match.
for (const match of migrationSql.matchAll(/create\s+unique\s+index[\s\S]*?;/gi)) {
  const statement = match[0]
  if (/\bwhere\b/i.test(statement)) continue
  const columns = /\(([^()]*)\)[^()]*;$/.exec(statement.trim())
  if (columns) targets.add(normalize(columns[1]))
}

// 2) Tablo duzeyi kisitlar.
for (const match of migrationSql.matchAll(/(?:unique|primary\s+key)\s*\(([^()]+)\)/gi)) {
  targets.add(normalize(match[1]))
}

// 3) Kolon duzeyi kisitlar: `id uuid primary key`, `page_hash text not null unique`.
const COLUMN_CONSTRAINT = /^\s*([a-z_][a-z0-9_]*)\s+[a-z][a-z0-9_ ]*?\b(?:primary\s+key|unique)\b/i
const NOT_A_COLUMN = /^\s*(?:constraint|create|alter|add|drop|comment|grant|revoke)\b/i
for (const line of migrationSql.split(/\r?\n/)) {
  if (NOT_A_COLUMN.test(line)) continue
  const column = COLUMN_CONSTRAINT.exec(line)
  if (column) targets.add(column[1])
}

const serviceFiles = collectFiles(path.join(rootDir, 'src', 'services'), '.ts')
const missing = []
let checked = 0

for (const file of serviceFiles) {
  const source = readFileSync(file, 'utf8')
  const relative = path.relative(rootDir, file).replace(/\\/g, '/')

  for (const match of source.matchAll(/onConflict:/g)) {
    // The value need not be a plain string; it can also be a ternary expression picked by
    // scope. The first version of the guard looked only at plain strings and
    // SILENTLY skipped the very line it should protect.
    // Same line only: later lines hold labels of other objects.
    const lineEnd = source.indexOf('\n', match.index)
    const tail = source.slice(match.index, lineEnd === -1 ? undefined : lineEnd)
    const literals = [...tail.matchAll(/(={2,3}\s*)?['"`]([a-z_][a-z0-9_]*(?:\s*,\s*[a-z_][a-z0-9_]*)*)['"`]/gi)]
      // `kind === 'manga'` gibi karsilastirma degerleri hedef degildir.
      .filter((item) => !item[1])
      .map((item) => item[2])

    if (literals.length === 0) {
      missing.push(`${relative} -> onConflict degeri statik olarak cozulemedi`)
      continue
    }

    for (const literal of literals) {
      checked += 1
      if (!targets.has(normalize(literal))) {
        missing.push(`${relative} -> onConflict '${literal}'`)
      }
    }
  }
}

assert.deepEqual(
  missing,
  [],
  'onConflict icin TAM tekillik hedefi yok (kismi indeks eslesmez, calisma aninda 42P10 verir):\n'
    + missing.join('\n'),
)

// Guard'in kendisi olu olmamali: hicbir kullanim bulunmuyorsa desen bozulmustur.
assert.ok(checked > 0, 'hicbir onConflict bulunamadi: guard olu')

console.log(`PASS onConflict/uniqueness contract verified (${checked} uses)`)
