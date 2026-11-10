import process from 'node:process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

/**
 * READ-ONLY live content audit.
 *
 * Scans live Supabase for shop/test/placeholder and inappropriate (non-SFW) user content
 * and reports it. DELETES NOTHING: the goal is listing candidates to clean from the admin
 * panel or in a separate approved delete step.
 *
 * Run: node scripts/audit-suspicious-content.mjs [--json]
 * Requires: SUPABASE_SERVICE_ROLE_KEY (admin env). See getAdminEnvSetupHint().
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Showcase seed rows (deterministic UUID prefixes) count as professional; marked in the report but separated as "seed".
const SEED_ID_PREFIXES = ['70000000-', '71000000-', '72000000-']

// Word boundaries prevent flagging legitimate content such as "denemeleri", "balkabağı" and
// "boyasıçramalı" because of a substring.
export const JUNK_PATTERNS = [
  /\bdeneme(?:user)?\b/iu,
  /\b(?:asdf|asdasd|qwe|qwp|zxc|lorem|placeholder|test123|xxx)\b/iu,
  /\b(?:sacma|saçma)\b/iu,
  /\b(?:cagatay|çağatay)\b/iu,
]

// SFW disi / kufur kaliplari (sinir kontrollu regex, Turkce).
export const PROFANITY_PATTERNS = [
  /göt[uü]?n?[uü]?/iu, /\bgotunu?\b/iu, /deldirme/iu, /\bsik(tir|er|ey)?\b/iu,
  /\bam[kq]\b/iu, /\boç\b/iu, /\bpi[cç]\b/iu, /\byarr?a[gğk]\b/iu, /\bgavat\b/iu,
  /\borospu\b/iu, /\byavsak\b/iu,
]

// Scanned tables. All string fields of each row are scanned, no need to know column names.
export const TARGET_TABLES = [
  'mangas',
  'fansubs',
  'store_items',
  'community_posts',
  'community_comments',
  'manga_comments',
  'user_manga_lists',
]

export function isSeedRow(row) {
  const id = String(row?.id ?? '')
  return SEED_ID_PREFIXES.some((prefix) => id.startsWith(prefix))
}

function scanValue(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(value)) return { reason: `junk:${pattern.source}`, sample: value.slice(0, 80) }
  }
  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(value)) return { reason: `nsfw:${pattern.source}`, sample: value.slice(0, 80) }
  }
  return null
}

function scanRow(row) {
  for (const [field, value] of Object.entries(row)) {
    const hit = scanValue(value)
    if (hit) return { field, ...hit }
  }
  return null
}

export function createAdminClient() {
  loadProjectEnv({ cwd: projectRoot, includeAdmin: true })
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(`VITE_SUPABASE_URL/SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik. ${getAdminEnvSetupHint()}`)
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function auditTable(supabase, table) {
  const { data, error } = await supabase.from(table).select('*').limit(5000)
  if (error) {
    return { table, error: error.message, hits: [] }
  }
  const hits = []
  for (const row of data ?? []) {
    const hit = scanRow(row)
    if (hit) {
      hits.push({
        id: row.id ?? '(no-id)',
        seed: isSeedRow(row),
        field: hit.field,
        reason: hit.reason,
        sample: hit.sample,
      })
    }
  }
  return { table, scanned: data?.length ?? 0, hits }
}

async function main() {
  const asJson = process.argv.includes('--json')

  const supabase = createAdminClient()

  const results = []
  for (const table of TARGET_TABLES) {
    results.push(await auditTable(supabase, table))
  }

  if (asJson) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  let totalHits = 0
  console.log('\n=== Supheli icerik denetimi (READ-ONLY, hicbir sey silinmedi) ===\n')
  for (const result of results) {
    if (result.error) {
      console.log(`[${result.table}] ERROR: ${result.error}`)
      continue
    }
    console.log(`[${result.table}] tarandi: ${result.scanned}, isaretli: ${result.hits.length}`)
    for (const hit of result.hits) {
      totalHits += 1
      const seedTag = hit.seed ? ' (SEED)' : ''
      console.log(`   - ${hit.id}${seedTag} | ${hit.field} | ${hit.reason} | "${hit.sample}"`)
    }
  }
  console.log(`\nToplam isaretli: ${totalHits}. Silme yok; admin panelinden ya da onayli bir adimla temizleyin.\n`)
}

// Run as a CLI only when executed directly; when another script imports it
// (e.g. purge-junk-content) the audit report should not print as a side effect.
const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exit(1)
  })
}
