import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

/*
 * In PL/pgSQL qualifying by function name (fn.x) is valid only for PARAMETERS;
 * a variable declared with declare and written as fn.x gives runtime 42P01 "missing FROM-clause
 * entry" (community_v2.fansub_admin_changed broke fansub approval this way). Checks the LAST
 * definition of each function.
 */
const dir = new URL('../../supabase/migrations/', import.meta.url)
const latest = new Map()
for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
  const sql = readFileSync(new URL(file, dir), 'utf8')
  const pattern = /create\s+(?:or\s+replace\s+)?function\s+(?:"?(\w+)"?\.)?"?(\w+)"?\s*\(([^)]*)\)[\s\S]*?as\s+(\$\w*\$)([\s\S]*?)\4/gi
  for (const match of sql.matchAll(pattern)) {
    const [, schema = 'public', name, args, , body] = match
    latest.set(`${schema}.${name}`.toLowerCase(), { file, name: name.toLowerCase(), args, body })
  }
}

const offenders = []
for (const [key, { file, name, args, body }] of latest) {
  const params = new Set(args.split(',').map((arg) => arg.trim().split(/\s+/)[0]?.replace(/"/g, '').toLowerCase()).filter(Boolean))
  for (const ref of body.toLowerCase().matchAll(new RegExp(`(?<![\\w."])${name}\\.(\\w+)`, 'g'))) {
    if (!params.has(ref[1])) offenders.push(`${key}: ${name}.${ref[1]} (${file})`)
  }
}
assert.deepEqual(offenders, [], 'only parameters can be qualified with the function name')
assert.ok(latest.has('community_v2.fansub_admin_changed'))

console.log(`PASS plpgsql qualified variable guard (${latest.size} functions)`)
