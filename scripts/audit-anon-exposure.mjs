import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

/**
 * PRIVACY AUDIT: what can an anonymous (signed-out) user/attacker see?
 *
 * Connects with the ANON key (NOT service_role); empirically tests what RLS really leaks.
 * Tries reading sensitive tables and reports whether returned rows hold sensitive
 * fields (email/session/ban/economy/IP/secret). READ-ONLY.
 *
 * Run: node scripts/audit-anon-exposure.mjs
 */

function readEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  const out = {}
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return out
}

const SENSITIVE_FIELD = /email|e-posta|phone|tel\b|password|sifre|secret|totp|mfa|\bip\b|ip_address|token|address|adres|birth|dogum|real_name|tc_|identity|kimlik|session|ban_reason|banned_by|auth_user_id/i

// Tables that must be FULLY closed to anon (a leak = a finding)
const PRIVATE_TABLES = [
  'auth_session_events', 'audit_logs', 'fansub_audit_logs', 'reports',
  'store_orders', 'store_order_items', 'store_wallet_ledger', 'user_inventory_items',
  'store_item_analytics_events', 'notifications', 'fansub_join_requests', 'fansub_invites',
  'coin_codes', 'fansub_code_redemptions', 'user_devices', 'account_security',
]

// Tables anon can read but that must not leak SENSITIVE columns
const PUBLIC_TABLES_FIELD_CHECK = ['users', 'fansubs', 'community_posts', 'manga_comments']

function scanRowForSensitive(row) {
  return Object.keys(row || {}).filter((k) => SENSITIVE_FIELD.test(k) && row[k] != null && row[k] !== false && row[k] !== '')
}

async function main() {
  const env = readEnv()
  const url = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('.env icinde VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY bulunamadi.')

  // IMPORTANT: no session, anon key only, like a real visitor.
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })

  const findings = []
  console.log('\n=== ANON PRIVACY AUDIT (no session, ANON key) ===\n')

  console.log('--- (1) Tables that must be fully closed ---')
  for (const table of PRIVATE_TABLES) {
    const { data, error } = await sb.from(table).select('*').limit(3)
    if (error) {
      console.log(`  [closed] ${table} -> access denied (${error.code || error.message.slice(0, 30)})`)
    } else {
      const n = data?.length ?? 0
      if (n > 0) {
        const cols = Object.keys(data[0])
        console.log(`  [!! SIZINTI] ${table} -> ${n} satir OKUNDU; kolonlar: ${cols.slice(0, 12).join(', ')}`)
        findings.push(`${table}: anon ${n}+ satir okuyabiliyor`)
      } else {
        console.log(`  [empty] ${table} -> access open but 0 rows (RLS likely filters)`)
      }
    }
  }

  console.log('\n--- (2) Public tablolarda hassas kolon sizintisi ---')
  for (const table of PUBLIC_TABLES_FIELD_CHECK) {
    const { data, error } = await sb.from(table).select('*').limit(5)
    if (error) { console.log(`  ${table} -> no access (${error.code || 'error'})`); continue }
    const n = data?.length ?? 0
    const sensitiveCols = new Set()
    for (const row of data || []) scanRowForSensitive(row).forEach((c) => sensitiveCols.add(c))
    if (sensitiveCols.size > 0) {
      console.log(`  [!! HASSAS ALAN] ${table} (${n} satir) -> anon goruyor: ${[...sensitiveCols].join(', ')}`)
      findings.push(`${table}: anon hassas alan goruyor (${[...sensitiveCols].join(', ')})`)
    } else {
      console.log(`  [ok] ${table} (${n} satir) -> hassas alan donmuyor`)
    }
  }

  console.log('\n--- (3) auth.users / email access ---')
  for (const probe of [
    () => sb.from('users').select('email').limit(1),
    () => sb.schema('auth').from('users').select('email').limit(1),
    () => sb.rpc('get_upload_auth_context'),
  ]) {
    try {
      const { data, error } = await probe()
      if (error) console.log(`  [closed] -> ${error.message.slice(0, 60)}`)
      else console.log(`  [!! WARNING] email/auth access is open: ${JSON.stringify(data).slice(0, 100)}`)
    } catch (e) { console.log(`  [closed] -> ${String(e.message).slice(0, 50)}`) }
  }

  console.log(`\n=== RESULT: ${findings.length === 0 ? 'No open leak found for anon.' : findings.length + ' potential findings:'} ===`)
  findings.forEach((f) => console.log('  - ' + f))
  console.log('')
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
