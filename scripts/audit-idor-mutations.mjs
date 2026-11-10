import fs from 'node:fs'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { loadProjectEnv, getAdminEnvSetupHint } from './lib/project-env.mjs'
import { signInAndClaimActiveSession } from './lib/attacker-session.mjs'

/**
 * IDOR / privilege audit.
 *
 * Can a non-admin attacker (tester) change/delete resources (comment/post/list/fansub)
 * belonging to SOMEONE ELSE? Empirically tests RLS row protection.
 *
 * Safety: delete tests run only on a created SINGLE-USE row; existing
 * content uses UPDATE -> verify -> revert. service_role is only for
 * setup/verification/cleanup; attack attempts use the attacker session.
 *
 * Run: node scripts/audit-idor-mutations.mjs
 */

// ADMINSIZ saldirgan. tester@example.com aslinda admin'dir; dusuk-yetkili hesap denemeuser.
const ATTACKER = { email: process.env.AUDIT_ATTACKER_EMAIL || '', password: process.env.AUDIT_ATTACKER_PASSWORD || '' }
const DISPOSABLE_COMMENT_ID = '7d000000-0000-4000-8000-000000000001'

function readEnv() {
  const env = {}
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const results = []
function record(name, blocked, detail) {
  results.push({ name, blocked, detail })
  console.log(`  ${blocked ? '[PASS] engellendi' : '[!! IDOR] BASARILI'} — ${name}${detail ? ` (${detail})` : ''}`)
}

// Finds a foreign row, the attacker tries UPDATE, an admin verifies, reverts if changed.
async function idorUpdateRevert(attacker, admin, record, table, ownerCol, field, attackerId, label) {
  const { data: rows } = await admin.from(table).select(`id,${field},${ownerCol}`).neq(ownerCol, attackerId).limit(1)
  const row = rows && rows[0]
  if (!row) { console.log(`  (uygun yabanci ${table} satiri yok, atlandi)`); return }
  const original = row[field]
  await attacker.from(table).update({ [field]: `${original} [IDOR]` }).eq('id', row.id)
  const { data: after } = await admin.from(table).select(field).eq('id', row.id).maybeSingle()
  const blocked = after?.[field] === original
  record(label, blocked, `${field}="${String(after?.[field]).slice(0, 40)}"`)
  if (!blocked) await admin.from(table).update({ [field]: original }).eq('id', row.id)
}

async function main() {
  const env = readEnv()
  const url = env.VITE_SUPABASE_URL
  loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !env.VITE_SUPABASE_ANON_KEY || !serviceKey) {
    throw new Error(`Env eksik. ${getAdminEnvSetupHint()}`)
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  // Also claim the active session to build a REAL authenticated context (otherwise tests block trivially).
  const { client: attacker, identity } = await signInAndClaimActiveSession(url, env.VITE_SUPABASE_ANON_KEY, ATTACKER)
  const attackerId = identity.id
  if (identity.role === 'admin') throw new Error('INVALID: the attacker is an admin. The IDOR test must use a NON-ADMIN account.')
  console.log(`\n=== IDOR DENETIMI — saldirgan: ${identity.username} (rol=${identity.role}, ${attackerId.slice(0, 8)}) ===\n`)

  // Target: a user who is NOT the attacker
  const { data: targetUser } = await admin.from('users').select('id,username').neq('id', attackerId).limit(1).maybeSingle()
  const targetId = targetUser.id
  const { data: manga } = await admin.from('mangas').select('id').limit(1).maybeSingle()

  // --- TEST 1: someone else's manga comment (UPDATE + DELETE), single-use row ---
  console.log('--- (1) Someone else manga comment ---')
  await admin.from('manga_comments').delete().eq('id', DISPOSABLE_COMMENT_ID)
  const { error: insErr } = await admin.from('manga_comments').insert({
    id: DISPOSABLE_COMMENT_ID, manga_id: manga.id, chapter_id: null, user_id: targetId, parent_id: null,
    content: 'IDOR-fixture-orijinal', likes: 0, dislikes: 0, is_spoiler: false, is_pinned: false, is_active: true,
  })
  if (insErr) {
    console.log('  ! fixture olusturulamadi:', insErr.message)
  } else {
    await attacker.from('manga_comments').update({ content: 'IDOR-saldiri-degisti' }).eq('id', DISPOSABLE_COMMENT_ID)
    const { data: afterUpd } = await admin.from('manga_comments').select('content').eq('id', DISPOSABLE_COMMENT_ID).maybeSingle()
    record('manga_comment UPDATE (baskasinin)', afterUpd?.content === 'IDOR-fixture-orijinal', `icerik="${afterUpd?.content}"`)

    await attacker.from('manga_comments').delete().eq('id', DISPOSABLE_COMMENT_ID)
    const { data: afterDel } = await admin.from('manga_comments').select('id').eq('id', DISPOSABLE_COMMENT_ID).maybeSingle()
    record('manga_comment DELETE (baskasinin)', !!afterDel, afterDel ? 'hala duruyor' : 'SILINDI')
    await admin.from('manga_comments').delete().eq('id', DISPOSABLE_COMMENT_ID)
  }

  // --- TEST 2: baskasinin topluluk postu (UPDATE -> geri-al) ---
  console.log('\n--- (2) Baskasinin topluluk postu (UPDATE) ---')
  await idorUpdateRevert(attacker, admin, record, 'community_posts', 'author_id', 'title', attackerId, 'community_post UPDATE (baskasinin)')

  // --- TEST 3: baskasinin yorumu — topluluk (UPDATE -> geri-al) ---
  console.log('\n--- (3) Someone else community comment (UPDATE) ---')
  await idorUpdateRevert(attacker, admin, record, 'community_comments', 'author_id', 'body', attackerId, 'community_comment UPDATE (baskasinin)')

  // --- TEST 3b: baskasinin listesi (UPDATE -> geri-al) ---
  console.log('\n--- (3b) Baskasinin listesi (UPDATE) ---')
  await idorUpdateRevert(attacker, admin, record, 'user_manga_lists', 'owner_id', 'title', attackerId, 'user_manga_list UPDATE (baskasinin)')

  // --- TEST 4: yetkisiz fansub duzenleme (UPDATE -> geri-al) ---
  console.log('\n--- (4) Unauthorized fansub edit (UPDATE name) ---')
  const { data: foreignFansub } = await admin.from('fansubs').select('id,name').eq('is_active', true).limit(1).maybeSingle()
  if (!foreignFansub) console.log('  (fansub yok)')
  else {
    const original = foreignFansub.name
    await attacker.from('fansubs').update({ name: `${original} [IDOR]` }).eq('id', foreignFansub.id)
    const { data: after } = await admin.from('fansubs').select('name').eq('id', foreignFansub.id).maybeSingle()
    const blocked = after?.name === original
    record('fansub UPDATE (uye degil)', blocked, `name="${after?.name}"`)
    if (!blocked) await admin.from('fansubs').update({ name: original }).eq('id', foreignFansub.id)
  }

  const idor = results.filter((r) => !r.blocked)
  console.log(`\n=== RESULT: ${idor.length === 0 ? 'No IDOR found: all foreign mutations were blocked.' : idor.length + ' IDOR VULNERABILITIES:'} ===`)
  idor.forEach((r) => console.log('  !! ' + r.name))
  console.log('')
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
