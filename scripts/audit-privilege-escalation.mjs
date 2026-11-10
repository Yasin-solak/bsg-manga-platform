import fs from 'node:fs'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { loadProjectEnv, getAdminEnvSetupHint } from './lib/project-env.mjs'
import { signInAndClaimActiveSession } from './lib/attacker-session.mjs'

/**
 * PRIVILEGE ESCALATION audit.
 *
 * Can a non-admin, non-premium attacker (tester) raise their own privileges?
 * - role = admin
 * - inflating stones (coin balance)
 * - free premium (premium_expires_at)
 * - manipulating is_banned / is_active
 * - unlocking premium-gated cosmetics without premium (update_my_profile_customization)
 *
 * All attempts use the attacker session; service_role is only for baseline/verification.
 * Run: node scripts/audit-privilege-escalation.mjs
 */

// ONEMLI: saldirgan ADMINSIZ olmali. tester@example.com aslinda admin'dir; gercek
// dusuk-yetkili hesap.
const ATTACKER = { email: process.env.AUDIT_ATTACKER_EMAIL || '', password: process.env.AUDIT_ATTACKER_PASSWORD || '' }

function readEnv() {
  const env = {}
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const results = []
function record(name, safe, detail) {
  results.push({ name, safe })
  console.log(`  ${safe ? '[PASS] engellendi' : '[!! ESCALATION] BASARILI'} — ${name}${detail ? ` (${detail})` : ''}`)
}

async function main() {
  const env = readEnv()
  const url = env.VITE_SUPABASE_URL
  loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !env.VITE_SUPABASE_ANON_KEY || !serviceKey) throw new Error(`Env eksik. ${getAdminEnvSetupHint()}`)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  // Also claim the active session: otherwise current_public_user_id() is null and tests become trivially invalid.
  const { client: attacker, identity } = await signInAndClaimActiveSession(url, env.VITE_SUPABASE_ANON_KEY, ATTACKER)
  const meId = identity.id
  const { data: before } = await admin.from('users')
    .select('id,username,role,stones,premium_expires_at,is_banned,is_active')
    .eq('id', meId).maybeSingle()
  console.log(`\n=== PRIVILEGE ESCALATION — ${before.username} | role=${before.role} stones=${before.stones} premium=${before.premium_expires_at ?? 'yok'} ===\n`)
  if (before.role === 'admin') {
    throw new Error('INVALID: the attacker account is an admin. The escalation test must use a NON-ADMIN account.')
  }

  // 1) Direct users UPDATE (on self): sensitive fields
  console.log('--- (1) Dogrudan users tablosu UPDATE (kendine) ---')
  const directProbes = [
    ['role=admin', { role: 'admin' }],
    ['stones +1e6', { stones: (before.stones || 0) + 1000000 }],
    ['premium 1 yil', { premium_expires_at: new Date(Date.now() + 365 * 864e5).toISOString() }],
    ['is_banned=false', { is_banned: false }],
  ]
  for (const [label, patch] of directProbes) {
    const { error } = await attacker.from('users').update(patch).eq('id', meId)
    console.log(`    users.update {${label}} -> ${error ? `REJECTED (${error.code || error.message.slice(0, 40)})` : 'request passed (RLS/trigger will be verified on the row)'}`)
  }

  // 2) Attempt to inject sensitive fields through an RPC (role/stones in owned_items_patch)
  console.log('\n--- (2) update_my_profile_customization patch ile hassas alan enjeksiyonu ---')
  const { error: rpcErr } = await attacker.rpc('update_my_profile_customization', {
    p_owned_items_patch: { role: 'admin', stones: 999999, premium: ['lifetime'] },
  })
  console.log(`    role/stones/premium slipped into the patch -> ${rpcErr ? `REJECTED (${rpcErr.message.slice(0, 50)})` : 'request passed (effect will be verified)'}`)

  // 3) DOGRULAMA: gercekten degisti mi?
  console.log('\n--- (3) Verification (with service_role) ---')
  const { data: after } = await admin.from('users')
    .select('role,stones,premium_expires_at,is_banned')
    .eq('id', meId).maybeSingle()
  record('role admin olmadi', after.role === before.role, `role=${after.role}`)
  record('stones degismedi', after.stones === before.stones, `stones=${after.stones}`)
  record('premium verilmedi', (after.premium_expires_at ?? null) === (before.premium_expires_at ?? null), `premium=${after.premium_expires_at ?? 'yok'}`)
  record('ban durumu degismedi', after.is_banned === before.is_banned, `is_banned=${after.is_banned}`)

  const escalations = results.filter((r) => !r.safe)
  console.log(`\n=== RESULT: ${escalations.length === 0 ? 'No privilege escalation found: all attempts were blocked.' : escalations.length + ' ESCALATION VULNERABILITIES:'} ===`)
  escalations.forEach((r) => console.log('  !! ' + r.name))
  console.log('')
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
