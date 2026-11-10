import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

/**
 * Fansub Studio "showcase" seed for the Karanlik Koridor fansub (idempotent).
 *
 * Goal: showing redesigned tabs (Overview, Statistics, Chapters,
 * Community, Expressions, Membership) with real/full data.
 *
 * Seeds (all with deterministic id prefixes, rerunnable):
 * - chapters         71000000-...-00000009xxxx  (production curve + Chapters)
 * - community_posts  7a000000-...               (community activity + expression use + spoiler)
 * - community_comments 72000000-...-00000009xxxx (expression use)
 * - fansub_transactions 7d000000-...            (donation curve)  [best-effort]
 * - fansub_join_requests 7e000000-...           (Overview approval queue) [best-effort]
 * - fansub_follows                               (follower curve; table with no id)
 *
 * Usage:
 * node scripts/seed-karanlik-koridor-showcase.mjs            (DRY-RUN: plan + counts)
 * node scripts/seed-karanlik-koridor-showcase.mjs --apply    (apply)
 * node scripts/seed-karanlik-koridor-showcase.mjs --clean    (delete only seed rows)
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY (admin env).
 */

const FANSUB_SLUG = 'karanlik-koridor'
const APPLY = process.argv.includes('--apply')
const CLEAN_ONLY = process.argv.includes('--clean')

const CH_PREFIX = '71000000-0000-0000-0000-'
const POST_PREFIX = '7a000000-0000-0000-0000-'
const CMT_PREFIX = '72000000-0000-0000-0000-'
const TXN_PREFIX = '7d000000-0000-0000-0000-'
const JR_PREFIX = '7e000000-0000-0000-0000-'

const CH_BASE = 90000
const CMT_BASE = 90000

function uuid(prefix, n) {
  return `${prefix}${String(n).padStart(12, '0')}`
}
function isoDaysAgo(days, hourOffset = 0) {
  return new Date(Date.now() - days * 86400000 + hourOffset * 3600000).toISOString()
}
function pick(arr, i) {
  return arr[i % arr.length]
}

function admin() {
  loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`admin env eksik. ${getAdminEnvSetupHint()}`)
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function main() {
  const sb = admin()
  console.log(`\n=== Karanlik Koridor showcase seed ${APPLY ? '(APPLY)' : CLEAN_ONLY ? '(CLEAN)' : '(DRY-RUN)'} ===\n`)

  const { data: fansub, error: fErr } = await sb.from('fansubs').select('id,name').eq('slug', FANSUB_SLUG).maybeSingle()
  if (fErr || !fansub) throw new Error(`Fansub bulunamadi: ${fErr?.message || FANSUB_SLUG}`)
  const fid = fansub.id
  console.log(`Fansub: ${fansub.name} (${fid})`)

  const { data: mangas } = await sb.from('mangas').select('id,title').eq('fansub_id', fid).eq('is_active', true)
  if (!mangas?.length) throw new Error('Fansubun aktif mangasi yok.')
  console.log(`Manga: ${mangas.length}`)

  const { data: memberRows } = await sb.from('fansub_members').select('user_id').eq('fansub_id', fid)
  const memberIds = new Set((memberRows || []).map((m) => m.user_id))
  const { data: userRows } = await sb.from('users').select('id,username').limit(40)
  const users = (userRows || []).filter((u) => !memberIds.has(u.id))
  if (users.length < 3) throw new Error('Not enough users.')
  console.log(`Users (non-member): ${users.length}`)

  // Supporter tokens can be added only by a premium author (DB trigger). Finds a premium author
  // pool; otherwise plain content with no tokens is seeded and expression use stays 0.
  let premiumUsers = []
  try {
    const { data: premRows } = await sb.from('users').select('id,username')
      .gt('premium_expires_at', new Date().toISOString()).limit(15)
    premiumUsers = (premRows || []).filter((u) => !memberIds.has(u.id))
  } catch { premiumUsers = [] }
  console.log(`Premium yazar: ${premiumUsers.length}${premiumUsers.length ? '' : ' (token icerik atlanacak)'}`)

  // Aktif emoji/cikartma + guncel revision -> render edilebilir token.
  const { data: assets } = await sb.from('fansub_supporter_assets')
    .select('id,shortcode,asset_kind').eq('fansub_id', fid).eq('is_active', true)
  const assetIds = (assets || []).map((a) => a.id)
  const { data: revs } = assetIds.length
    ? await sb.from('fansub_supporter_asset_revisions').select('asset_id,revision_number,id').in('asset_id', assetIds)
    : { data: [] }
  const latestRev = new Map()
  for (const r of (revs || [])) {
    const cur = latestRev.get(r.asset_id)
    if (!cur || r.revision_number > cur.revision_number) latestRev.set(r.asset_id, r)
  }
  const emojiTokens = []
  const stickerTokens = []
  for (const a of (assets || [])) {
    const rev = latestRev.get(a.id)
    if (!rev) continue
    if (a.asset_kind === 'emoji') emojiTokens.push(`:fse_${a.shortcode}@${rev.id}:`)
    else stickerTokens.push(`[[fss_${a.shortcode}@${rev.id}]]`)
  }
  console.log(`Tokens: ${emojiTokens.length} emoji, ${stickerTokens.length} stickers`)

  // ─── Deterministik id setleri ───
  const POST_COUNT = 24
  const CH_COUNT = 18
  const CMT_COUNT = 30
  const TXN_COUNT = 16
  const JR_COUNT = Math.min(3, users.length)
  const FOLLOW_COUNT = Math.min(16, users.length)

  const postIds = Array.from({ length: POST_COUNT }, (_, i) => uuid(POST_PREFIX, i))
  const chIds = Array.from({ length: CH_COUNT }, (_, i) => uuid(CH_PREFIX, CH_BASE + i))
  const cmtIds = Array.from({ length: CMT_COUNT }, (_, i) => uuid(CMT_PREFIX, CMT_BASE + i))
  const txnIds = Array.from({ length: TXN_COUNT }, (_, i) => uuid(TXN_PREFIX, i))
  const jrIds = Array.from({ length: JR_COUNT }, (_, i) => uuid(JR_PREFIX, i))
  const followUserIds = users.slice(0, FOLLOW_COUNT).map((u) => u.id)

  // ─── CLEAN (her zaman once seed satirlarini sil) ───
  async function clean() {
    await sb.from('community_comments').delete().in('id', cmtIds)
    await sb.from('community_posts').delete().in('id', postIds)
    await sb.from('chapters').delete().in('id', chIds)
    await sb.from('fansub_transactions').delete().in('id', txnIds)
    await sb.from('fansub_join_requests').delete().in('id', jrIds)
    if (followUserIds.length) await sb.from('fansub_follows').delete().eq('fansub_id', fid).in('user_id', followUserIds)
  }

  if (!APPLY && !CLEAN_ONLY) {
    console.log('\nPLAN:')
    console.log(`  + ${CH_COUNT} chapters (across 5 mangas, over 40 days)`)
    console.log(`  + ${POST_COUNT} community posts (emoji/sticker/spoiler, over 30 days)`)
    console.log(`  + ${CMT_COUNT} comments (emoji/sticker)`)
    console.log(`  + ${TXN_COUNT} bagis (best-effort)`)
    console.log(`  + ${JR_COUNT} bekleyen katilim basvurusu (best-effort)`)
    console.log(`  + ${FOLLOW_COUNT} followers (over 30 days)`)
    console.log('\n(DRY-RUN — yazma yok. Uygulamak icin --apply)')
    return
  }

  console.log('\nTemizleniyor (onceki seed)...')
  await clean()
  if (CLEAN_ONLY) { console.log('Temizlendi.'); return }

  const report = {}
  const run = async (label, fn) => {
    try { await fn(); report[label] = 'OK' }
    catch (e) { report[label] = `HATA: ${e.message}` }
  }

  // ─── Bolumler ───
  await run('chapters', async () => {
    const rows = chIds.map((id, i) => {
      const manga = pick(mangas, i)
      const created = isoDaysAgo(Math.round((CH_COUNT - 1 - i) * (40 / CH_COUNT)), i % 6)
      return {
        id,
        manga_id: manga.id,
        fansub_id: fid,
        chapter_number: 900 + i,
        title: `Showcase Bolum ${i + 1}`,
        pages: Array.from({ length: 4 }, (_, p) =>
          `https://placehold.co/1200x1800/0b1220/e2e8f0?text=KK-B${900 + i}-S${p + 1}`),
        is_approved: true,
        is_active: true,
        created_at: created,
        updated_at: created,
      }
    })
    const { error } = await sb.from('chapters').insert(rows)
    if (error) throw error
  })

  // ─── Topluluk postlari ───
  const bodySnippets = [
    'Bu bolum gercekten nefes kesiciydi',
    'Karakter gelisimi bu seride harika ilerliyor',
    'Cizim kalitesi her bolumde artiyor',
    'Bu haftaki cevirimiz hakkinda ne dusunuyorsunuz',
    'Spoiler vermeden soyluyorum: final bolum efsane',
    'Yeni okuyuculara siddetle tavsiye ederiz',
    'Kapak paleti uzerinde calismaya devam ediyoruz',
    'Ekipce cok emek verdik, keyifli okumalar',
  ]
  await run('community_posts', async () => {
    const rows = postIds.map((id, i) => {
      const wantToken = premiumUsers.length > 0 && emojiTokens.length > 0 && (i % 2 === 0)
      const author = wantToken ? pick(premiumUsers, i) : pick(users, i)
      const emoji = wantToken ? pick(emojiTokens, i) : ''
      const sticker = (wantToken && i % 3 === 0 && stickerTokens.length) ? ` ${pick(stickerTokens, i)}` : ''
      const spoiler = (i % 5 === 0) ? ' Sonu ||baba katildi|| inanilmazdi.' : ''
      const created = isoDaysAgo(Math.round((POST_COUNT - 1 - i) * (29 / POST_COUNT)), i % 8)
      return {
        id,
        author_id: author.id,
        category: 'Genel',
        title: null,
        body: `${pick(bodySnippets, i)} ${emoji}${sticker}${spoiler}`.trim(),
        related_fansub_id: null,
        related_fansub_ids: [fid],
        mentioned_user_ids: [],
        mentioned_manga_ids: [],
        tags: ['karanlik-koridor'],
        frame_type: 'default',
        is_verified: false,
        status: 'approved',
        approved_at: created,
        is_active: true,
        likes_count: (i * 3) % 25,
        comments_count: 0,
        created_at: created,
        updated_at: created,
      }
    })
    const { error } = await sb.from('community_posts').insert(rows)
    if (error) throw error
  })

  // ─── Yorumlar (Ifade kullanimi) ───
  await run('community_comments', async () => {
    if (!report.community_posts || report.community_posts !== 'OK') throw new Error('posts were not added, comments skipped')
    const rows = cmtIds.map((id, i) => {
      const wantToken = premiumUsers.length > 0 && emojiTokens.length > 0 && (i % 2 === 0)
      const author = wantToken ? pick(premiumUsers, i + 1) : pick(users, i + 2)
      const emoji = wantToken ? pick(emojiTokens, i + 1) : ''
      const sticker = (wantToken && i % 4 === 0 && stickerTokens.length) ? ` ${pick(stickerTokens, i + 1)}` : ''
      const created = isoDaysAgo(Math.round((CMT_COUNT - 1 - i) * (28 / CMT_COUNT)), i % 5)
      return {
        id,
        post_id: pick(postIds, i),
        author_id: author.id,
        parent_id: null,
        body: `Harika anlatim ${emoji}${sticker}`.trim(),
        is_active: true,
        created_at: created,
        updated_at: created,
      }
    })
    const { error } = await sb.from('community_comments').insert(rows)
    if (error) throw error
  })

  // ─── Bagislar (best-effort) ───
  await run('fansub_transactions', async () => {
    // Learn the existing type value; otherwise try 'donation'.
    const { data: sample } = await sb.from('fansub_transactions').select('type').limit(1)
    const txnType = sample && sample[0]?.type ? sample[0].type : 'donation'
    const rows = txnIds.map((id, i) => {
      const created = isoDaysAgo(Math.round((TXN_COUNT - 1 - i) * (29 / TXN_COUNT)), i % 7)
      return {
        id,
        fansub_id: fid,
        amount: 50 + ((i * 37) % 450),
        type: txnType,
        description: 'Showcase bagis',
        created_by: pick(users, i).id,
        created_at: created,
      }
    })
    const { error } = await sb.from('fansub_transactions').insert(rows)
    if (error) throw error
  })

  // ─── Katilim basvurulari (best-effort) ───
  await run('fansub_join_requests', async () => {
    const rows = jrIds.map((id, i) => ({
      id,
      fansub_id: fid,
      requester_user_id: pick(users, i + 5).id,
      status: 'pending',
      message: 'Ekibe katilmak ve ceviri/redaksiyon destegi vermek istiyorum.',
      created_at: isoDaysAgo(i + 1, i),
      updated_at: isoDaysAgo(i + 1, i),
    }))
    const { error } = await sb.from('fansub_join_requests').insert(rows)
    if (error) throw error
  })

  // ─── Takipciler (id'siz tablo) ───
  await run('fansub_follows', async () => {
    const rows = followUserIds.map((userId, i) => ({
      user_id: userId,
      fansub_id: fid,
      created_at: isoDaysAgo(Math.round((FOLLOW_COUNT - 1 - i) * (29 / FOLLOW_COUNT)), i % 9),
    }))
    const { error } = await sb.from('fansub_follows').upsert(rows, { onConflict: 'user_id,fansub_id' })
    if (error) throw error
  })

  console.log('\nRESULT:')
  for (const [k, v] of Object.entries(report)) console.log(`  ${v === 'OK' ? '✓' : '✗'} ${k}: ${v}`)
  console.log('\nBitti.')
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nFATAL:', e.message); process.exit(1) })
