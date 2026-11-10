import process from 'node:process'
import {
  TARGET_TABLES,
  auditTable,
  createAdminClient,
} from './audit-suspicious-content.mjs'

/**
 * SURGICALLY cleans suspicious/test/non-SFW content from the live DB.
 *
 * SAFETY PRINCIPLES:
 * - Only rows the audit marks NON-SEED are targeted (SEED is protected).
 * - Deleting a manga/post/comment/product/list cascades only its own subtree -> safe.
 * - Deleting a fansub can delete manga (fansub_id ON DELETE CASCADE). So a junk
 * fansub HOLDING a showcase or a non-junk manga is NOT DELETED, it is kept and reported.
 * - DRY-RUN by default. For real deletion: --apply
 *
 * Run:
 * node scripts/purge-junk-content.mjs           (dry-run, deletes nothing)
 * node scripts/purge-junk-content.mjs --apply   (approved deletion)
 */

const APPLY = process.argv.includes('--apply')
const DELETE_BATCH = 100

// Hard delete: content rows; cascades their own subtrees, no guard trigger.
const HARD_DELETE_TABLES = ['mangas', 'community_posts', 'community_comments', 'manga_comments', 'lists']
// Soft delete (is_active=false): tables guarded by economy/identity triggers.
// store_items cannot be hard deleted because of order history, fansubs because of membership/economy links;
// the right cleanup deactivates them and hides them from all surfaces (ledger integrity is kept).
const SOFT_DELETE_TABLES = ['store_items']

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function collectFlagged(supabase) {
  const map = {}
  for (const table of TARGET_TABLES) {
    const result = await auditTable(supabase, table)
    map[table] = (result.hits || []).filter((hit) => !hit.seed)
  }
  return map
}

async function planFansubs(supabase, flaggedFansubs) {
  const deletable = []
  const protectedList = []
  for (const hit of flaggedFansubs) {
    const { data: ownedMangas, error } = await supabase
      .from('mangas')
      .select('id,title')
      .eq('fansub_id', hit.id)
    if (error) {
      protectedList.push({ ...hit, reasonProtect: `manga sorgusu hatasi: ${error.message}` })
      continue
    }
    // A fansub is kept if it has a showcase (SEED prefix) or any non-junk manga.
    const flaggedMangaIds = new Set()
    const owned = ownedMangas || []
    const protectedMangas = owned.filter(
      (m) => String(m.id).startsWith('70000000-') || !looksJunk(m.title),
    )
    if (protectedMangas.length > 0) {
      protectedList.push({
        ...hit,
        reasonProtect: `${protectedMangas.length} korunan manga barindiriyor ( or. "${protectedMangas[0].title}")`,
      })
    } else {
      deletable.push({ ...hit, ownedCount: owned.length })
    }
    void flaggedMangaIds
  }
  return { deletable, protectedList }
}

// Simple check: is the title obvious junk? (a keep decision for planFansubs)
function looksJunk(title) {
  const lower = String(title || '').toLowerCase()
  return ['deneme', 'qwe', 'asdf', 'cagatay', 'balkaba', 'boyasi', 'test123'].some((t) => lower.includes(t))
    || /göt|gotunu|deldirme/i.test(String(title || ''))
}

async function deleteByIds(supabase, table, ids) {
  let deleted = 0
  const errors = []
  for (const group of chunk(ids, DELETE_BATCH)) {
    const { error } = await supabase.from(table).delete().in('id', group)
    if (error) errors.push(error.message)
    else deleted += group.length
  }
  return { deleted, errors }
}

async function deactivateByIds(supabase, table, ids) {
  let updated = 0
  const errors = []
  for (const group of chunk(ids, DELETE_BATCH)) {
    const { error } = await supabase.from(table).update({ is_active: false }).in('id', group)
    if (error) errors.push(error.message)
    else updated += group.length
  }
  return { updated, errors }
}

async function main() {
  const supabase = createAdminClient()
  const flagged = await collectFlagged(supabase)
  const fansubPlan = await planFansubs(supabase, flagged.fansubs || [])

  console.log(`\n=== Cop temizligi ${APPLY ? '(UYGULAMA — silme aktif)' : '(DRY-RUN — hicbir sey silinmez)'} ===\n`)

  // 1) Hard-delete icerik tablolari (kendi alt-agaclarini cascade'ler)
  for (const table of HARD_DELETE_TABLES) {
    const hits = flagged[table] || []
    console.log(`[${table}] silinecek (hard): ${hits.length}`)
    for (const hit of hits.slice(0, 6)) console.log(`   - ${hit.id} | "${hit.sample}"`)
    if (hits.length > 6) console.log(`   ... +${hits.length - 6} daha`)
    if (APPLY && hits.length > 0) {
      const { deleted, errors } = await deleteByIds(supabase, table, hits.map((h) => h.id))
      console.log(`   -> deleted: ${deleted}${errors.length ? `, errors: ${errors.length} (${errors[0]})` : ''}`)
    }
  }

  // 2) Soft delete tables (hidden from all surfaces with is_active=false)
  for (const table of SOFT_DELETE_TABLES) {
    const hits = (flagged[table] || []).filter((h) => h.field !== '__inactive__')
    console.log(`\n[${table}] deaktive edilecek (soft): ${hits.length}`)
    for (const hit of hits.slice(0, 6)) console.log(`   - ${hit.id} | "${hit.sample}"`)
    if (hits.length > 6) console.log(`   ... +${hits.length - 6} daha`)
    if (APPLY && hits.length > 0) {
      const { updated, errors } = await deactivateByIds(supabase, table, hits.map((h) => h.id))
      console.log(`   -> deactivated: ${updated}${errors.length ? `, errors: ${errors.length} (${errors[0]})` : ''}`)
    }
  }

  // 3) Fansubs: kept ones are untouched; empty/junk ones are deactivated
  // (a hard delete fires a refund trigger and violates a store_orders check;
  //  deactivation is both safe and by design.)
  console.log(`\n[fansubs] KORUNAN (showcase/gercek manga barindiriyor): ${fansubPlan.protectedList.length}`)
  for (const f of fansubPlan.protectedList) console.log(`   ~ ${f.id} | "${f.sample}" | ${f.reasonProtect}`)
  console.log(`[fansubs] TO DEACTIVATE (empty/junk only): ${fansubPlan.deletable.length}`)
  for (const f of fansubPlan.deletable) console.log(`   - ${f.id} | "${f.sample}" | sahip oldugu manga: ${f.ownedCount}`)
  if (APPLY && fansubPlan.deletable.length > 0) {
    const { updated, errors } = await deactivateByIds(supabase, 'fansubs', fansubPlan.deletable.map((f) => f.id))
    console.log(`   -> deactivated: ${updated}${errors.length ? `, errors: ${errors.length} (${errors[0]})` : ''}`)
  }

  console.log(`\n${APPLY ? 'Cleanup applied.' : 'DRY-RUN finished. Run with --apply to really delete.'}\n`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
