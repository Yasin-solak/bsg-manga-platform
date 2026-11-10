import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function listSourceFiles(dir) {
  return readdirSync(path.join(rootDir, dir), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${dir}/${entry.name}`
    if (entry.isDirectory()) return listSourceFiles(relativePath)
    return /\.(ts|tsx)$/.test(entry.name) ? [relativePath] : []
  })
}

function run(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

run('store admin mutation hardening migration sets the RPC and audit chain', () => {
  const migrationSource = read('supabase/migrations/20260415235904_store_admin_mutation_security_rpc.sql')

  assert.match(migrationSource, /create or replace function public\.admin_upsert_store_item\(/i)
  assert.match(migrationSource, /create or replace function public\.admin_set_store_item_active_state\(/i)
  assert.match(migrationSource, /create or replace function public\.admin_set_store_item_pricing\(/i)
  assert.match(migrationSource, /create or replace function public\.admin_delete_store_item\(/i)
  assert.match(migrationSource, /if v_actor_id is null or not public\.is_admin\(\) then/i)
  assert.match(migrationSource, /case when v_is_insert then 'store_item\.create' else 'store_item\.update' end/i)
  assert.match(migrationSource, /perform public\.create_admin_audit_log\(\s*'store_item\.active_state\.update'/i)
  assert.match(migrationSource, /perform public\.create_admin_audit_log\(\s*'store_item\.pricing\.update'/i)
  assert.match(migrationSource, /perform public\.create_admin_audit_log\(\s*'store_item\.delete'/i)
  assert.match(migrationSource, /grant execute on function public\.admin_delete_store_item\(uuid\) to authenticated;/i)
})

run('client code does not write directly to the store_items table', () => {
  // The old shop admin is gone; no client code writes directly to store_items
  // (a Shop v3 cosmetic record opens only through the shop_admin_create_cosmetic RPC).
  for (const file of listSourceFiles('src')) {
    assert.doesNotMatch(read(file), /\.from\(['"]store_items['"]\)\s*\.(insert|update|upsert|delete)\(/, `${file} store_items'a dogrudan yazmamali`)
  }
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
