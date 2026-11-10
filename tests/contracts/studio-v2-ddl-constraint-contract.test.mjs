import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = path.resolve(fileURLToPath(new URL('../../supabase/migrations/', import.meta.url)))
const files = readdirSync(migrationDir).filter((name) => name.includes('translation_studio_v2') && name.endsWith('.sql'))

for (const file of files) {
  const sql = readFileSync(path.join(migrationDir, file), 'utf8')
  // SQL expressions such as COALESCE are not functions; a schema prefix produces 42883.
  assert.doesNotMatch(sql, /pg_catalog\.(?:coalesce|nullif|greatest|least)\s*\(/i, `${file}: schema added to an SQL expression`)
  const tables = sql.matchAll(/create table(?: if not exists)? public\.([a-z_]+)\s*\(([\s\S]*?)^\);/gm)
  for (const [, tableName, body] of tables) {
    const explicitChecks = new Set([...body.matchAll(/\bconstraint\s+([a-z_]+)\s+check\s*\(/gi)]
      .map((match) => match[1]))
    for (const [, columnName] of body.matchAll(/^\s{2}([a-z_]+)\s+[^\n]*\bcheck\s*\(/gm)) {
      // PostgreSQL generates the name table_column_check for an unnamed column CHECK;
      // a second constraint written with the same name gives 42710 during table creation.
      const generatedName = `${tableName}_${columnName}_check`
      assert.ok(!explicitChecks.has(generatedName), `${file}: ${generatedName} forms twice`)
    }
  }
}
