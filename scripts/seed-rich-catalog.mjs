import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'
import { CATALOG_FANSUBS, CATALOG_MANGAS, coverPathFor, slugify } from './data/rich-catalog.mjs'

/**
 * Phase 2: rich catalog DB seed (idempotent, deterministic).
 *
 * Does:
 * 1. Renames 6 junk-named fansubs to CATALOG_FANSUBS professional names.
 * 2. Adds catalog manga NOT CONFLICTING with existing titles under the 70000000- seed prefix
 * (so audit/purge protects them as SEED), with generated covers.
 * 3. Adds 3 chapters + top comment + reply per manga (from active users).
 *
 * Rerunnable: deletes its own prefixed rows and rebuilds.
 * Requires: SUPABASE_SERVICE_ROLE_KEY (admin env).
 */

const MANGA_ID_PREFIX = '70000000-0000-0000-0000-'   // showcase family; the 301+ block belongs to this seed
const CHAPTER_ID_PREFIX = '71000000-0000-0000-0000-'
const COMMENT_ID_PREFIX = '72000000-0000-0000-0000-'
const MANGA_BASE = 301   // 101-110 existing showcase; 301+ this catalog
const CHAPTER_BASE = 3000
const COMMENT_BASE = 3000

const CHAPTER_TITLES = ['Baslangic', 'Kirilma', 'Yuzlesme']

function toUuid(prefix, index) {
  return `${prefix}${String(index).padStart(12, '0')}`
}

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function normalizeTitle(value) {
  return slugify(value)
}

function buildPageUrls(seriesIndex, chapterNumber) {
  return Array.from({ length: 4 }, (_, pageIndex) => (
    `https://placehold.co/1200x1800/111827/F8FAFC?text=${encodeURIComponent(`K${seriesIndex + 1}-B${chapterNumber}-S${pageIndex + 1}`)}`
  ))
}

function createAdminClient() {
  loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`Supabase admin env eksik. ${getAdminEnvSetupHint()}`)
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Renamlenmeye uygun junk-isimli fansublar: sondaki rakam / qq / deneme / qa codex / qwe.
function looksRepurposable(name) {
  return /\d{2,}|qq\b|deneme|qa codex|qwe/i.test(String(name || ''))
}

async function renameFansubs(sb) {
  const { data: fansubs, error } = await sb.from('fansubs').select('id,name,slug').eq('is_active', true)
  if (error) throw error
  const targets = fansubs.filter((f) => looksRepurposable(f.name)).slice(0, CATALOG_FANSUBS.length)
  const mapping = {}
  for (let i = 0; i < CATALOG_FANSUBS.length; i += 1) {
    const cat = CATALOG_FANSUBS[i]
    const target = targets[i]
    if (!target) { mapping[cat.key] = null; continue }
    const { error: upErr } = await sb.from('fansubs')
      .update({ name: cat.name, slug: cat.slug, description: cat.desc })
      .eq('id', target.id)
    if (upErr) {
      console.log(`   ! ${cat.name} rename error: ${upErr.message}`)
      mapping[cat.key] = target.id // use it for manga assignment anyway
    } else {
      console.log(`   ~ "${target.name}" -> "${cat.name}"`)
      mapping[cat.key] = target.id
    }
  }
  // Fall back to the first valid id for unmatched catalog fansubs
  const fallback = Object.values(mapping).find(Boolean)
  for (const cat of CATALOG_FANSUBS) if (!mapping[cat.key]) mapping[cat.key] = fallback
  return mapping
}

async function main() {
  const sb = createAdminClient()
  console.log('\n=== Faz 2: zengin katalog seed ===\n')

  console.log('[1] Renaming junk fansubs to professional names')
  const fansubMap = await renameFansubs(sb)

  // Mevcut basliklar (cakisma onleme)
  const { data: existing } = await sb.from('mangas').select('title')
  const existingTitles = new Set((existing || []).map((m) => normalizeTitle(m.title)))
  const activeFansubIds = new Set(Object.values(fansubMap).filter(Boolean))

  // Eklenecek katalog (cakismayanlar)
  const toInsert = CATALOG_MANGAS
    .map((m, i) => ({ ...m, catIndex: i }))
    .filter((m) => !existingTitles.has(normalizeTitle(m.title)))

  console.log(`\n[2] ${toInsert.length}/${CATALOG_MANGAS.length} catalog mangas will be added (conflicts skipped)`)

  // Idempotency: clear this seed's id block (cascades chapters/comments)
  const myMangaIds = toInsert.map((_, idx) => toUuid(MANGA_ID_PREFIX, MANGA_BASE + idx))
  if (myMangaIds.length) await sb.from('mangas').delete().in('id', myMangaIds)

  const mangaRows = toInsert.map((m, idx) => {
    const fansubId = fansubMap[m.fansub] || [...activeFansubIds][idx % activeFansubIds.size]
    return {
      id: toUuid(MANGA_ID_PREFIX, MANGA_BASE + idx),
      fansub_id: fansubId,
      title: m.title,
      slug: `${slugify(m.title)}-c${String(MANGA_BASE + idx)}`,
      cover_image_url: coverPathFor(m.title),
      description: m.synopsis,
      author: m.author,
      artist: m.author,
      status: m.status,
      total_views: 800 + idx * 240,
      total_ratings: 12 + idx * 2,
      rating: Number((4.0 + ((idx % 5) * 0.16)).toFixed(2)),
      is_new: idx % 4 === 0,
      is_approved: true,
      is_active: true,
      last_chapter_number: 3,
      genres: m.genres,
      original_lang: 'tr',
      release_date: `2026-0${(idx % 6) + 1}-1${idx % 9}`,
      created_at: new Date(Date.UTC(2026, 2, 1 + idx, 9, 0, 0)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 4, 1, 9, 0, 0)).toISOString(),
    }
  })

  const { error: mErr } = await sb.from('mangas').insert(mangaRows)
  if (mErr) throw new Error(`manga insert: ${mErr.message}`)
  console.log(`   -> ${mangaRows.length} manga eklendi`)

  // Bolumler
  const chapters = []
  mangaRows.forEach((manga, mi) => {
    for (let cn = 1; cn <= 3; cn += 1) {
      chapters.push({
        id: toUuid(CHAPTER_ID_PREFIX, CHAPTER_BASE + mi * 10 + cn),
        manga_id: manga.id,
        fansub_id: manga.fansub_id,
        chapter_number: cn,
        title: CHAPTER_TITLES[cn - 1],
        pages: buildPageUrls(mi, cn),
        is_approved: true,
        is_active: true,
        publish_at: new Date(Date.UTC(2026, 2, 2 + mi, 12 + cn, 0, 0)).toISOString(),
        created_at: new Date(Date.UTC(2026, 2, 2 + mi, 10 + cn, 0, 0)).toISOString(),
        updated_at: new Date(Date.UTC(2026, 4, 1, 9, 0, 0)).toISOString(),
      })
    }
  })
  const { error: cErr } = await sb.from('chapters').insert(chapters)
  if (cErr) throw new Error(`chapter insert: ${cErr.message}`)
  console.log(`   -> ${chapters.length} chapters added`)

  // Comments + replies (from active users)
  const { data: users } = await sb.from('users').select('id,username').eq('is_active', true).limit(20)
  if (!users || users.length < 3) {
    console.log('   ! Not enough active users, comments skipped')
  } else {
    const comments = []
    let ci = COMMENT_BASE
    mangaRows.forEach((manga, mi) => {
      const u1 = users[mi % users.length]
      const u2 = users[(mi + 1) % users.length]
      const base = new Date(Date.UTC(2026, 4, 10, 8 + (mi % 8), 0, 0))
      const topId = toUuid(COMMENT_ID_PREFIX, ci); ci += 1
      comments.push({
        id: topId, manga_id: manga.id, chapter_id: null, user_id: u1.id, parent_id: null,
        content: `${manga.title} gercekten iyi baslamis, atmosferi cok saglam. Devamini merakla bekliyorum.`,
        likes: 3 + (mi % 6), dislikes: mi % 2, is_spoiler: false, is_pinned: mi === 0, is_active: true,
        created_at: base.toISOString(), updated_at: base.toISOString(),
      })
      const replyAt = new Date(base.getTime() + 12 * 60 * 1000)
      comments.push({
        id: toUuid(COMMENT_ID_PREFIX, ci), manga_id: manga.id, chapter_id: null, user_id: u2.id, parent_id: topId,
        content: `Katiliyorum, ozellikle ${manga.genres[0].toLowerCase()} kismi cok iyi islenmis.`,
        likes: 1 + (mi % 3), dislikes: 0, is_spoiler: false, is_pinned: false, is_active: true,
        created_at: replyAt.toISOString(), updated_at: replyAt.toISOString(),
      }); ci += 1
    })
    for (const group of chunk(comments, 200)) {
      const { error: cmErr } = await sb.from('manga_comments').insert(group)
      if (cmErr) throw new Error(`comment insert: ${cmErr.message}`)
    }
    console.log(`   -> ${comments.length} comments (top + reply) added`)
  }

  console.log('\nKatalog seed tamamlandi.\n')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
